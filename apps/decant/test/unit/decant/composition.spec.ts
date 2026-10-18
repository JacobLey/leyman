/* eslint-disable no-template-curly-in-string -- expected types are TypeScript source, with template literal types */
import { suite, test } from 'mocha-chain';
import { expectDecanted } from '../../lib/expect-decanted.js';

suite('composition', () => {
    suite('allOf', () => {
        test('intersects objects', () => {
            expectDecanted(
                {
                    allOf: [
                        { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
                        { type: 'object', properties: { b: { type: 'number' } } },
                    ],
                },
                { Schema: '{ a: string; b?: number }' }
            );
        });

        test('intersects the same property', () => {
            expectDecanted(
                {
                    allOf: [
                        { type: 'object', properties: { a: { type: ['string', 'null'] } } },
                        {
                            type: 'object',
                            properties: { a: { type: 'string' } },
                            required: ['a'],
                        },
                    ],
                },
                { Schema: '{ a: string }' }
            );
        });

        test('inherits the parent type', () => {
            expectDecanted(
                { type: ['string', 'null'], allOf: [{ pattern: '^a' }, { pattern: 'b$' }] },
                { Schema: '(`a${string}` & `${string}b`) | null' }
            );
        });

        test('conflicting types are never', () => {
            expectDecanted(
                { allOf: [{ type: 'string' }, { type: 'number' }] },
                { Schema: 'never' }
            );
        });

        test('conflicting values are never', () => {
            expectDecanted({ allOf: [{ const: 'a' }, { const: 'b' }] }, { Schema: 'never' });
        });

        test('narrows arrays', () => {
            expectDecanted(
                { type: 'array', allOf: [{ items: { type: 'string' } }, { minItems: 1 }] },
                { Schema: '[string, ...string[]]' }
            );
        });

        test('narrows the items of arrays', () => {
            expectDecanted(
                {
                    allOf: [
                        { type: 'array', items: { type: ['string', 'number'] } },
                        { type: 'array', items: { type: 'string' } },
                    ],
                },
                { Schema: 'string[]' }
            );
        });

        test('narrows the items of a tuple', () => {
            expectDecanted(
                {
                    type: 'array',
                    allOf: [
                        { prefixItems: [true], items: false, minItems: 1 },
                        { items: { type: 'number' } },
                    ],
                },
                { Schema: '[number]' }
            );
        });

        test('two tuples stay an intersection', () => {
            expectDecanted(
                {
                    type: 'array',
                    allOf: [
                        { prefixItems: [{ type: 'string' }], minItems: 1 },
                        { prefixItems: [true, { type: 'number' }], minItems: 2 },
                    ],
                },
                { Schema: '[string, ...unknown[]] & [unknown, number, ...unknown[]]' }
            );
        });

        test('many unions are not distributed', () => {
            const values = ['a', 'b', 'c', 'd', 'e', 'f'];
            expectDecanted(
                { allOf: [{ enum: values }, { enum: values.map(value => value.toUpperCase()) }] },
                {
                    Schema: '("a" | "b" | "c" | "d" | "e" | "f") & ("A" | "B" | "C" | "D" | "E" | "F")',
                }
            );
        });
    });

    suite('anyOf and oneOf', () => {
        test('anyOf is a union', () => {
            expectDecanted(
                { anyOf: [{ type: 'string' }, { type: 'number' }] },
                { Schema: 'string | number' }
            );
        });

        test('oneOf is a union', () => {
            expectDecanted(
                {
                    oneOf: [
                        {
                            type: 'object',
                            properties: { kind: { const: 'a' } },
                            required: ['kind'],
                        },
                        {
                            type: 'object',
                            properties: { kind: { const: 'b' } },
                            required: ['kind'],
                        },
                    ],
                },
                { Schema: '{ kind: "a" } | { kind: "b" }' }
            );
        });

        test('literals are absorbed by their type', () => {
            expectDecanted(
                { anyOf: [{ type: 'string' }, { const: 'a' }, { pattern: '^a', type: 'string' }] },
                { Schema: 'string' }
            );
        });

        test('nested unions are flattened', () => {
            expectDecanted(
                { anyOf: [{ type: ['string', 'null'] }, { type: 'number' }] },
                { Schema: 'string | null | number' }
            );
        });

        test('unknown absorbs everything', () => {
            expectDecanted({ anyOf: [{ type: 'string' }, true] }, { Schema: 'unknown' });
        });

        test('narrowed by the parent', () => {
            expectDecanted(
                { type: 'string', anyOf: [{ type: 'string', pattern: '^a' }, { type: 'number' }] },
                { Schema: '`a${string}`' }
            );
        });
    });

    suite('if then else', () => {
        test('if, then and else', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: { kind: { type: 'string' }, a: { type: 'number' } },
                    if: { properties: { kind: { const: 'a' } }, required: ['kind'] },
                    // eslint-disable-next-line unicorn/no-thenable
                    then: { required: ['a'] },
                    else: { properties: { a: false } },
                },
                {
                    Schema: '{ kind: "a"; a: number } | { kind?: string; a?: never }',
                }
            );
        });

        test('without else allows anything else', () => {
            expectDecanted(
                // eslint-disable-next-line unicorn/no-thenable
                { type: 'string', if: { pattern: '^a' }, then: { pattern: 'b$' } },
                { Schema: 'string' }
            );
        });

        test('without then', () => {
            expectDecanted(
                { if: { type: 'string' }, else: { type: 'number' } },
                { Schema: 'string | number' }
            );
        });
    });

    suite('not', () => {
        test('not anything is never', () => {
            expectDecanted({ not: {} }, { Schema: 'never' });
        });

        test('removes null', () => {
            expectDecanted(
                { type: ['string', 'null'], not: { type: 'null' } },
                { Schema: 'string' }
            );
        });

        test('removes values', () => {
            expectDecanted({ enum: ['a', 'b', 'c'], not: { enum: ['a', 'b'] } }, { Schema: '"c"' });
        });

        test('removes the only value', () => {
            expectDecanted({ const: 'a', not: { const: 'a' } }, { Schema: 'never' });
        });

        test('other schemas leave the type', () => {
            expectDecanted({ type: 'string', not: { pattern: '^a' } }, { Schema: 'string' });
        });
    });
});
