import { expect } from '@leyman/expect';
import {
    decant,
    DecantInvalidSchemaError,
    DecantStrictModeError,
    DecantUnsupportedError,
} from 'decant';
import { suite, test } from 'mocha-chain';
import { expectDecanted } from '../../lib/expect-decanted.js';
import { typeCheck } from '../../lib/type-check.js';

const document = (openapi: string, schemas: Record<string, unknown>): unknown => ({
    openapi,
    info: { title: 'API', version: '1.0.0' },
    paths: {},
    components: { schemas },
});

suite('OpenAPI documents', () => {
    test('every component schema is a type', () => {
        expectDecanted(
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
        expectDecanted(
            document('3.0.3', {
                Name: { type: 'string', nullable: true, example: 'Ada' },
            }),
            { Name: 'string | null' }
        );
    });

    test('OpenAPI keywords', () => {
        expectDecanted(
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
            decant(document('3.1.0', { Name: { type: 'string', nullable: true } }))
        ).to.throw(DecantStrictModeError);
    });

    test('a document without schemas has no types', () => {
        const source = decant({ openapi: '3.1.0', info: { title: 'API', version: '1.0.0' } });

        expect(typeCheck({ 'decanted.ts': source })).to.deep.equal([]);
        expect(source).not.to.contain('export');
    });

    test('discriminator needs a propertyName', () => {
        expect(() =>
            decant(document('3.1.0', { Pet: { oneOf: [true], discriminator: { mapping: {} } } }))
        ).to.throw(DecantInvalidSchemaError);
    });

    test('components must be an object', () => {
        expect(() => decant({ openapi: '3.1.0', components: [] })).to.throw(
            DecantInvalidSchemaError
        );
    });

    test('other versions are not supported', () => {
        expect(() => decant({ openapi: '2.0' })).to.throw(DecantUnsupportedError);
    });

    test('version must be a string', () => {
        expect(() => decant({ openapi: 3 })).to.throw(DecantUnsupportedError);
    });

    test('OpenAPI keywords outside a document', () => {
        expectDecanted(
            { type: 'string', nullable: true, xml: { name: 'name' } },
            { Schema: 'string | null' },
            { openApi30: true }
        );
    });
});
