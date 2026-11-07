import { expect } from '@leyman/expect';
import {
    genever,
    GeneverInvalidSchemaError,
    GeneverStrictModeError,
    GeneverUnsupportedError,
} from 'genever';
import { suite, test } from 'mocha-chain';
import { expectGenerated } from '../../lib/expect-generated.js';
import { typeCheck } from '../../lib/type-check.js';

const document = (openapi: string, schemas: Record<string, unknown>): unknown => ({
    openapi,
    info: { title: 'API', version: '1.0.0' },
    paths: {},
    components: { schemas },
});

suite('OpenAPI documents', () => {
    test('every component schema is a type', () => {
        expectGenerated(
            document('3.1.0', {
                User: {
                    type: 'object',
                    properties: {
                        name: { type: ['string', 'null'] },
                        address: { $ref: '#/components/schemas/Address' },
                    },
                    required: ['name'],
                },
                Address: { type: 'object', properties: { city: { type: 'string' } } },
            }),
            { User: '{ name: string | null; address?: Address }', Address: '{ city?: string }' }
        );
    });

    test('OpenAPI 3.0 schemas', () => {
        expectGenerated(
            document('3.0.3', {
                Name: { type: 'string', nullable: true, example: 'Ada' },
            }),
            { Name: 'string | null' }
        );
    });

    test('OpenAPI keywords', () => {
        expectGenerated(
            document('3.1.0', {
                Pet: {
                    oneOf: [
                        { $ref: '#/components/schemas/Cat' },
                        { $ref: '#/components/schemas/Dog' },
                    ],
                    discriminator: { propertyName: 'kind' },
                    externalDocs: { url: 'https://example.com' },
                },
                Cat: {
                    type: 'object',
                    properties: { kind: { const: 'cat' } },
                    required: ['kind'],
                    xml: { name: 'cat' },
                    example: { kind: 'cat' },
                },
                Dog: { type: 'object', properties: { kind: { const: 'dog' } }, required: ['kind'] },
            }),
            { Pet: 'Cat | Dog', Cat: '{ kind: "cat" }', Dog: '{ kind: "dog" }' }
        );
    });

    test('nullable is OpenAPI 3.0 only', () => {
        expect(() =>
            genever(document('3.1.0', { Name: { type: 'string', nullable: true } }))
        ).to.throw(GeneverStrictModeError);
    });

    test('a document without schemas has no types', () => {
        const source = genever({ openapi: '3.1.0', info: { title: 'API', version: '1.0.0' } });

        expect(typeCheck({ 'generated.ts': source })).to.deep.equal([]);
        expect(source).not.to.contain('export');
    });

    test('discriminator needs a propertyName', () => {
        expect(() =>
            genever(document('3.1.0', { Pet: { oneOf: [true], discriminator: { mapping: {} } } }))
        ).to.throw(GeneverInvalidSchemaError);
    });

    suite('discriminator', () => {
        const cat = { type: 'object', properties: { kind: { const: 'cat' } }, required: ['kind'] };
        const dog = { type: 'object', properties: { kind: { const: 'dog' } }, required: ['kind'] };
        const pets = (pet: Record<string, unknown>, others: Record<string, unknown> = {}) =>
            document('3.1.0', { Pet: pet, Cat: cat, Dog: dog, ...others });
        const branches = [
            { $ref: '#/components/schemas/Cat' },
            { $ref: '#/components/schemas/Dog' },
        ];

        test('every branch requires the property', () => {
            expect(() =>
                genever(pets({ oneOf: branches, discriminator: { propertyName: 'kind' } }))
            ).not.to.throw();
        });

        test('the schema requires the property', () => {
            expect(() =>
                genever(
                    pets({
                        type: 'object',
                        properties: { kind: { type: 'string' } },
                        required: ['kind'],
                        anyOf: [{ properties: { a: true } }, { properties: { b: true } }],
                        discriminator: { propertyName: 'kind' },
                    })
                )
            ).not.to.throw();
        });

        test('a branch requires it through allOf', () => {
            const base = {
                type: 'object',
                properties: { kind: { type: 'string' } },
                required: ['kind'],
            };
            expect(() =>
                genever(
                    document('3.0.3', {
                        Base: base,
                        Pet: {
                            oneOf: [{ $ref: '#/components/schemas/Cat' }],
                            discriminator: { propertyName: 'kind' },
                        },
                        Cat: { allOf: [{ $ref: '#/components/schemas/Base' }] },
                    })
                )
            ).not.to.throw();
        });

        test('a branch does not require the property', () => {
            expect(() =>
                genever(
                    pets({
                        oneOf: [...branches, { type: 'object' }],
                        discriminator: { propertyName: 'kind' },
                    })
                )
            ).to.throw(GeneverStrictModeError, 'must be required');
        });

        test('without branches, the schema must require it', () => {
            expect(() =>
                genever(pets({ type: 'object', discriminator: { propertyName: 'kind' } }))
            ).to.throw(GeneverStrictModeError, 'must be required');
        });

        test('a branch that refers to itself does not require it', () => {
            expect(() =>
                genever(
                    pets(
                        {
                            oneOf: [{ $ref: '#/components/schemas/Loop' }],
                            discriminator: { propertyName: 'kind' },
                        },
                        { Loop: { allOf: [{ $ref: '#/components/schemas/Loop' }] } }
                    ),
                    { strict: false }
                )
            ).not.to.throw();
        });

        test('a broken reference is reported as such', () => {
            expect(() =>
                genever(pets({ oneOf: [{ $ref: 1 }], discriminator: { propertyName: 'kind' } }))
            ).to.throw(GeneverInvalidSchemaError, '$ref must be a string');
        });

        test('mapping targets exist', () => {
            expect(() =>
                genever(
                    pets({
                        oneOf: branches,
                        discriminator: {
                            propertyName: 'kind',
                            mapping: { cat: 'Cat', dog: '#/components/schemas/Dog' },
                        },
                    })
                )
            ).not.to.throw();
        });

        for (const target of ['Fish', '#/components/schemas/Fish']) {
            test(`a mapping target that does not exist: ${target}`, () => {
                expect(() =>
                    genever(
                        pets({
                            oneOf: branches,
                            discriminator: { propertyName: 'kind', mapping: { fish: target } },
                        })
                    )
                ).to.throw(GeneverStrictModeError, 'does not exist');
            });
        }

        test('not checked outside strict mode', () => {
            expect(() =>
                genever(
                    pets({
                        oneOf: [{ type: 'object' }],
                        discriminator: { propertyName: 'kind', mapping: { fish: 'Fish' } },
                    }),
                    { strict: false }
                )
            ).not.to.throw();
        });
    });

    test('components must be an object', () => {
        expect(() => genever({ openapi: '3.1.0', components: [] })).to.throw(
            GeneverInvalidSchemaError
        );
    });

    test('other versions are not supported', () => {
        expect(() => genever({ openapi: '2.0' })).to.throw(GeneverUnsupportedError);
    });

    test('version must be a string', () => {
        expect(() => genever({ openapi: 3 })).to.throw(GeneverUnsupportedError);
    });

    test('OpenAPI keywords outside a document', () => {
        expectGenerated(
            { type: 'string', nullable: true, xml: { name: 'name' } },
            { Schema: 'string | null' },
            { openApi30: true }
        );
    });
});
