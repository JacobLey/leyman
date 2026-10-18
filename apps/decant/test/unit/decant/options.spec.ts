import { suite, test } from 'mocha-chain';
import { expectDecanted } from '../../lib/expect-decanted.js';

suite('options', () => {
    suite('openApi30', () => {
        test('nullable', () => {
            expectDecanted(
                { type: 'string', nullable: true, example: 'abc' },
                { Schema: 'string | null' },
                { openApi30: true }
            );
        });

        test('boolean exclusive bounds', () => {
            expectDecanted(
                { type: 'number', minimum: 1, maximum: 1, exclusiveMaximum: true },
                { Schema: 'never' },
                { openApi30: true, strict: false }
            );
        });

        test('boolean exclusive bounds that allow a value', () => {
            expectDecanted(
                { type: 'number', minimum: 1, maximum: 2, exclusiveMinimum: true },
                { Schema: 'number' },
                { openApi30: true }
            );
        });

        test('not nullable', () => {
            expectDecanted(
                { type: 'string', nullable: false },
                { Schema: 'string' },
                { openApi30: true }
            );
        });
    });

    suite('strict disabled', () => {
        test('a schema without a type accepts every type', () => {
            expectDecanted(
                { properties: { a: { type: 'string' } }, required: ['a'] },
                { Schema: '{ a: string } | string | number | boolean | null | unknown[]' },
                { strict: false }
            );
        });

        test('keywords constrain only their own type', () => {
            expectDecanted(
                { minLength: 1, items: { type: 'number' } },
                { Schema: 'string | number[] | number | boolean | null | Record<string, unknown>' },
                { strict: false }
            );
        });

        test('values not of the type are dropped', () => {
            expectDecanted(
                { type: 'string', enum: ['a', 1, null] },
                { Schema: '"a"' },
                { strict: false }
            );
        });

        suite('contradictions accept nothing', () => {
            const never: Record<string, unknown> = {
                'minLength greater than maxLength': { type: 'string', minLength: 3, maxLength: 2 },
                'minimum greater than maximum': { type: 'number', minimum: 3, maximum: 2 },
                'equal exclusive bounds': { type: 'number', exclusiveMinimum: 2, maximum: 2 },
                'no integer between bounds': { type: 'integer', minimum: 1.2, maximum: 1.8 },
                'no integer between exclusive bounds': {
                    type: 'integer',
                    exclusiveMinimum: 1,
                    exclusiveMaximum: 2,
                },
                'minItems greater than maxItems': { type: 'array', minItems: 3, maxItems: 2 },
                'minContains greater than maxContains': {
                    type: 'array',
                    contains: true,
                    minContains: 3,
                    maxContains: 2,
                },
                'contains with maxContains 0': { type: 'array', contains: true, maxContains: 0 },
                'tuple shorter than minItems': {
                    type: 'array',
                    prefixItems: [true],
                    items: false,
                    minItems: 2,
                },
                'minProperties greater than maxProperties': {
                    type: 'object',
                    minProperties: 3,
                    maxProperties: 2,
                },
                'more required properties than maxProperties': {
                    type: 'object',
                    properties: { a: true, b: true },
                    required: ['a', 'b'],
                    maxProperties: 1,
                },
                'required property that is never valid': {
                    type: 'object',
                    properties: { a: false },
                    required: ['a'],
                },
                'minProperties more than allowed': {
                    type: 'object',
                    properties: { a: true },
                    additionalProperties: false,
                    minProperties: 2,
                },
            };
            for (const [name, schema] of Object.entries(never)) {
                test(name, () => {
                    expectDecanted(schema, { Schema: 'never' }, { strict: false });
                });
            }

            test('only the contradicting type', () => {
                expectDecanted(
                    { type: ['string', 'null'], minLength: 3, maxLength: 2 },
                    { Schema: 'null' },
                    { strict: false }
                );
            });
        });

        test('maxContains without contains is ignored', () => {
            expectDecanted(
                { type: 'array', maxContains: 0 },
                { Schema: 'unknown[]' },
                { strict: false }
            );
        });

        test('maxItems truncates a tuple', () => {
            expectDecanted(
                {
                    type: 'array',
                    prefixItems: [{ type: 'string' }, { type: 'number' }],
                    items: { type: 'boolean' },
                    maxItems: 1,
                },
                { Schema: '[string?]' },
                { strict: false }
            );
        });

        test('ignores unknown keywords', () => {
            expectDecanted(
                { type: 'string', foo: 1, nullable: true },
                { Schema: 'string' },
                { strict: false }
            );
        });

        test('ignores keywords of other types', () => {
            expectDecanted({ type: 'string', minimum: 1 }, { Schema: 'string' }, { strict: false });
        });

        test('ignores then without if', () => {
            expectDecanted(
                // eslint-disable-next-line unicorn/no-thenable
                { type: 'string', then: { type: 'number' } },
                { Schema: 'string' },
                { strict: false }
            );
        });
    });
});
