import type { Schema } from 'juniper';
import { Ajv } from 'ajv';
import { expect } from '@leyman/expect';
import {
    arraySchema,
    customSchema,
    defineRecursive,
    numberSchema,
    objectSchema,
    stringSchema,
    tupleSchema,
} from 'juniper';
import { suite, test } from 'mocha-chain';
import { compile } from '../../ajv.js';

const toDraft07 = (schema: Schema<unknown>): unknown =>
    schema['~standard'].jsonSchema.input({ target: 'draft-07' });

/**
 * Check that the draft-07 output is valid draft-07, and accepts exactly what the 2020-12 output does.
 *
 * @param schema - juniper schema
 * @param values - values to validate against both
 */
const expectSameValidation = (schema: Schema<unknown>, values: unknown[]): void => {
    const options = { strict: true, strictRequired: false, strictTuples: false };
    const validate2020 = compile(schema.toJSON(), options);
    const ajv = new Ajv(options);
    const validate07 = ajv.compile(toDraft07(schema) as object);
    for (const value of values) {
        expect(validate07(value), JSON.stringify(value)).to.equal(validate2020(value));
    }
};

suite('draft-07', () => {
    test('Keywords both drafts share are unchanged', () => {
        const schema = objectSchema({
            properties: { a: stringSchema().minLength(1), b: numberSchema().nullable() },
            required: ['a'],
            additionalProperties: false,
        }).title('Shared');
        expect(toDraft07(schema)).to.deep.equal(schema.toJSON());
    });

    test('$schema names draft-07', () => {
        expect(
            stringSchema()['~standard'].jsonSchema.input(
                { target: 'draft-07' },
                { schema: true, id: 'https://example.com/string' }
            )
        ).to.deep.equal({
            type: 'string',
            $id: 'https://example.com/string',
            $schema: 'https://json-schema.org/draft-07/schema#',
        });
    });

    suite('prefixItems', () => {
        test('Tuple', () => {
            const schema = tupleSchema().prefixItem(stringSchema()).prefixItem(numberSchema());
            expect(toDraft07(schema)).to.deep.equal({
                type: 'array',
                items: [{ type: 'string' }, { type: 'number' }],
                additionalItems: false,
                minItems: 2,
                maxItems: 2,
            });
            expectSameValidation(schema, [[], ['a', 1], ['a', 1, 2], [1, 'a']]);
        });

        test('Open, with items after', () => {
            const schema = arraySchema(numberSchema()).prefixItem(stringSchema());
            expect(toDraft07(schema)).to.deep.equal({
                type: 'array',
                items: [{ type: 'string' }],
                additionalItems: { type: 'number' },
            });
            expectSameValidation(schema, [[], ['a'], ['a', 1], ['a', 'b'], [1]]);
        });

        test('Open, with anything after', () => {
            const schema = arraySchema().prefixItem(stringSchema());
            expect(toDraft07(schema)).to.deep.equal({
                type: 'array',
                items: [{ type: 'string' }],
            });
            expectSameValidation(schema, [[], ['a', 1], [1]]);
        });

        test('items alone is unchanged', () => {
            const schema = arraySchema(stringSchema());
            expect(toDraft07(schema)).to.deep.equal(schema.toJSON());
        });
    });

    suite('contains', () => {
        test('Kept, with the default minContains', () => {
            const schema = arraySchema().contains(stringSchema());
            expect(toDraft07(schema)).to.deep.equal({
                type: 'array',
                contains: { type: 'string' },
            });
            expectSameValidation(schema, [[], [1], ['a'], [1, 'a']]);
        });

        test('Dropped with minContains 0', () => {
            const schema = arraySchema({ minContains: 0 }).contains(stringSchema());
            expect(toDraft07(schema)).to.deep.equal({ type: 'array' });
        });

        test('minContains above 1 has no draft-07 form', () => {
            const schema = arraySchema({ minContains: 2 }).contains(stringSchema());
            expect(() => toDraft07(schema)).to.throw(
                Error,
                'JSON Schema target: "draft-07" does not support "minContains" here'
            );
        });

        test('maxContains has no draft-07 form', () => {
            const schema = arraySchema({ maxContains: 2 }).contains(stringSchema());
            expect(() => toDraft07(schema)).to.throw(
                Error,
                'JSON Schema target: "draft-07" does not support "maxContains" here'
            );
        });
    });

    suite('dependencies', () => {
        test('dependentRequired and dependentSchemas', () => {
            const schema = objectSchema({
                properties: { a: numberSchema(), b: numberSchema(), c: numberSchema() },
            })
                .dependentRequired('a', ['b'])
                .dependentRequired('b', ['a'])
                .dependentSchemas(
                    'a',
                    objectSchema({ properties: { c: numberSchema() }, required: ['c'] })
                )
                .dependentSchemas('c', objectSchema().maxProperties(2));
            expect(toDraft07(schema)).to.deep.equal({
                type: 'object',
                properties: {
                    a: { type: 'number' },
                    b: { type: 'number' },
                    c: { type: 'number' },
                },
                dependencies: {
                    a: {
                        allOf: [
                            { required: ['b'] },
                            { properties: { c: { type: 'number' } }, required: ['c'] },
                        ],
                    },
                    b: ['a'],
                    c: { maxProperties: 2 },
                },
            });
            expectSameValidation(schema, [
                {},
                { a: 1 },
                { a: 1, b: 2 },
                { a: 1, b: 2, c: 3 },
                { b: 2 },
                { b: 2, c: 3 },
                { c: 3 },
            ]);
        });
    });

    suite('unevaluatedProperties', () => {
        test('Becomes additionalProperties', () => {
            const schema = objectSchema({
                properties: { a: numberSchema() },
            })
                .patternProperties('^x-', stringSchema())
                .unevaluatedProperties(false);
            expect(toDraft07(schema)).to.deep.equal({
                type: 'object',
                properties: { a: { type: 'number' } },
                patternProperties: { '^x-': { type: 'string' } },
                additionalProperties: false,
            });
            expectSameValidation(schema, [{}, { a: 1 }, { 'x-b': 'b' }, { b: 1 }, { a: 'a' }]);
        });

        test('Dropped when additionalProperties evaluates the rest', () => {
            const schema = objectSchema({
                properties: { a: numberSchema() },
                additionalProperties: true,
                unevaluatedProperties: false,
            });
            expect(toDraft07(schema)).to.deep.equal({
                type: 'object',
                properties: { a: { type: 'number' } },
                additionalProperties: true,
            });
            expectSameValidation(schema, [{ a: 1, b: 2 }]);
        });

        test('Dropped when true', () => {
            const schema = objectSchema().unevaluatedProperties(true);
            expect(toDraft07(schema)).to.deep.equal({ type: 'object' });
        });

        test('No draft-07 form beside an applicator', () => {
            const schema = objectSchema()
                .allOf(objectSchema({ properties: { a: numberSchema() } }))
                .unevaluatedProperties(false);
            expect(() => toDraft07(schema)).to.throw(
                Error,
                'JSON Schema target: "draft-07" does not support "unevaluatedProperties" here'
            );
        });
    });

    suite('unevaluatedItems', () => {
        test('Becomes additionalItems after prefixItems', () => {
            const schema = customSchema({
                type: 'array',
                prefixItems: [{ type: 'string' }],
                unevaluatedItems: false,
            });
            expect(toDraft07(schema)).to.deep.equal({
                type: 'array',
                items: [{ type: 'string' }],
                additionalItems: false,
            });
            expectSameValidation(schema, [[], ['a'], ['a', 'b']]);
        });

        test('Becomes items', () => {
            const schema = customSchema({ type: 'array', unevaluatedItems: { type: 'string' } });
            expect(toDraft07(schema)).to.deep.equal({
                type: 'array',
                items: { type: 'string' },
            });
            expectSameValidation(schema, [[], ['a'], [1]]);
        });

        test('Dropped when items evaluates the rest', () => {
            const schema = customSchema({ items: true, unevaluatedItems: false });
            expect(toDraft07(schema)).to.deep.equal({ items: true });
        });

        test('No draft-07 form beside contains', () => {
            const schema = customSchema({ contains: { type: 'string' }, unevaluatedItems: false });
            expect(() => toDraft07(schema)).to.throw(
                Error,
                'JSON Schema target: "draft-07" does not support "unevaluatedItems" here'
            );
        });
    });

    suite('$ref', () => {
        test('$defs become definitions', () => {
            const address = objectSchema({
                properties: { city: stringSchema() },
                required: ['city'],
            }).define('Address');
            const user = objectSchema({
                properties: { home: address, work: address.nullable() },
            }).define('User');
            expect(toDraft07(user)).to.deep.equal({
                $ref: '#/definitions/User',
                definitions: {
                    Address: {
                        type: 'object',
                        properties: { city: { type: 'string' } },
                        required: ['city'],
                    },
                    User: {
                        type: 'object',
                        properties: {
                            home: { $ref: '#/definitions/Address' },
                            work: {
                                anyOf: [{ $ref: '#/definitions/Address' }, { type: 'null' }],
                            },
                        },
                    },
                },
            });
            expectSameValidation(user, [
                {},
                { home: { city: 'a' } },
                { home: {} },
                { work: null },
                { home: null },
            ]);
        });

        test('Recursive definitions', () => {
            const tree = defineRecursive('Tree', self =>
                objectSchema({ properties: { children: arraySchema(self) } })
            );
            expect(toDraft07(tree)).to.deep.equal({
                $ref: '#/definitions/Tree',
                definitions: {
                    Tree: {
                        type: 'object',
                        properties: {
                            children: {
                                type: 'array',
                                items: { $ref: '#/definitions/Tree' },
                            },
                        },
                    },
                },
            });
            expectSameValidation(tree, [
                {},
                { children: [{ children: [] }] },
                { children: [{ children: [1] }] },
            ]);
        });

        test('Pointers through $defs, and other references, are kept', () => {
            const schema = customSchema({
                properties: {
                    a: { $ref: '#/$defs/A/properties/b' },
                    b: { $ref: 'https://example.com/$defs/x' },
                    c: { $ref: '#/properties/$defs' },
                    d: { $ref: '#/properties/$defs/$defs/a' },
                    e: { $ref: '#/allOf/0/$defs/a' },
                },
                $defs: { A: { properties: { b: { type: 'string' } } } },
            });
            expect(toDraft07(schema)).to.deep.equal({
                properties: {
                    a: { $ref: '#/definitions/A/properties/b' },
                    b: { $ref: 'https://example.com/$defs/x' },
                    c: { $ref: '#/properties/$defs' },
                    d: { $ref: '#/properties/$defs/definitions/a' },
                    e: { $ref: '#/allOf/0/definitions/a' },
                },
                definitions: { A: { properties: { b: { type: 'string' } } } },
            });
        });

        test('Moves into allOf beside constraints', () => {
            const schema = customSchema({
                $ref: '#/$defs/Name',
                type: 'string',
                description: 'A name',
                maxLength: 3,
                allOf: [{ pattern: '^a' }],
                $defs: { Name: { type: 'string' } },
            });
            expect(toDraft07(schema)).to.deep.equal({
                type: 'string',
                description: 'A name',
                maxLength: 3,
                allOf: [{ $ref: '#/definitions/Name' }, { pattern: '^a' }],
                definitions: { Name: { type: 'string' } },
            });
            expectSameValidation(schema, ['a', 'abcd', 'b', 1]);
        });
    });

    test('Keywords with no draft-07 form', () => {
        const schema = customSchema({ $dynamicRef: '#node' });
        expect(() => toDraft07(schema)).to.throw(
            Error,
            'JSON Schema target: "draft-07" does not support "$dynamicRef" here'
        );
    });
});
