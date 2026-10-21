/* eslint-disable no-template-curly-in-string -- expected types are TypeScript source, with template literal types */
import { suite, test } from 'mocha-chain';
import { expectGenerated } from '../../lib/expect-generated.js';

suite('composition', () => {
    suite('allOf', () => {
        test('intersects objects', () => {
            expectGenerated(
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
            expectGenerated(
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
            expectGenerated(
                { type: ['string', 'null'], allOf: [{ pattern: '^a' }, { pattern: 'b$' }] },
                { Schema: '(`a${string}` & `${string}b`) | null' }
            );
        });

        test('conflicting types are never', () => {
            expectGenerated(
                { allOf: [{ type: 'string' }, { type: 'number' }] },
                { Schema: 'never' }
            );
        });

        test('conflicting values are never', () => {
            expectGenerated({ allOf: [{ const: 'a' }, { const: 'b' }] }, { Schema: 'never' });
        });

        test('narrows arrays', () => {
            expectGenerated(
                { type: 'array', allOf: [{ items: { type: 'string' } }, { minItems: 1 }] },
                { Schema: '[string, ...string[]]' }
            );
        });

        test('narrows the items of arrays', () => {
            expectGenerated(
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
            expectGenerated(
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
            expectGenerated(
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
            expectGenerated(
                { allOf: [{ enum: values }, { enum: values.map(value => value.toUpperCase()) }] },
                {
                    Schema: '("a" | "b" | "c" | "d" | "e" | "f") & ("A" | "B" | "C" | "D" | "E" | "F")',
                }
            );
        });
    });

    suite('anyOf and oneOf', () => {
        test('anyOf is a union', () => {
            expectGenerated(
                { anyOf: [{ type: 'string' }, { type: 'number' }] },
                { Schema: 'string | number' }
            );
        });

        test('oneOf is a union', () => {
            expectGenerated(
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

        test('a discriminator is allowed, and does not change the union', () => {
            expectGenerated(
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
                    discriminator: { propertyName: 'kind' },
                },
                { Schema: '{ kind: "a" } | { kind: "b" }' }
            );
        });

        test('type object is redundant next to a oneOf of objects', () => {
            expectGenerated(
                {
                    type: 'object',
                    oneOf: [
                        { properties: { kind: { const: 'a' } }, required: ['kind'] },
                        { properties: { kind: { const: 'b' } }, required: ['kind'] },
                    ],
                },
                { Schema: '{ kind: "a" } | { kind: "b" }' }
            );
        });

        test('literals are absorbed by their type', () => {
            expectGenerated(
                { anyOf: [{ type: 'string' }, { const: 'a' }, { pattern: '^a', type: 'string' }] },
                { Schema: 'string' }
            );
        });

        test('nested unions are flattened', () => {
            expectGenerated(
                { anyOf: [{ type: ['string', 'null'] }, { type: 'number' }] },
                { Schema: 'string | null | number' }
            );
        });

        test('unknown absorbs everything', () => {
            expectGenerated({ anyOf: [{ type: 'string' }, true] }, { Schema: 'unknown' });
        });

        test('narrowed by the parent', () => {
            expectGenerated(
                { type: 'string', anyOf: [{ type: 'string', pattern: '^a' }, { type: 'number' }] },
                { Schema: '`a${string}`' }
            );
        });
    });

    suite('if then else', () => {
        test('if, then and else', () => {
            expectGenerated(
                {
                    type: 'object',
                    properties: { kind: { type: 'string' }, a: { type: 'number' } },
                    if: { properties: { kind: { const: 'a' } }, required: ['kind'] },
                    then: { required: ['a'] },
                    else: { properties: { a: false } },
                },
                {
                    Schema: '{ kind: "a"; a: number } | { kind?: string; a?: never }',
                }
            );
        });

        test('without else allows anything else', () => {
            expectGenerated(
                { type: 'string', if: { pattern: '^a' }, then: { pattern: 'b$' } },
                { Schema: 'string' }
            );
        });

        test('without then', () => {
            expectGenerated(
                { if: { type: 'string' }, else: { type: 'number' } },
                { Schema: 'string | number' }
            );
        });
    });

    suite('not', () => {
        test('not anything is never', () => {
            expectGenerated({ not: {} }, { Schema: 'never' });
        });

        test('removes null', () => {
            expectGenerated(
                { type: ['string', 'null'], not: { type: 'null' } },
                { Schema: 'string' }
            );
        });

        test('removes values', () => {
            expectGenerated(
                { enum: ['a', 'b', 'c'], not: { enum: ['a', 'b'] } },
                { Schema: '"c"' }
            );
        });

        test('removes the only value', () => {
            expectGenerated({ const: 'a', not: { const: 'a' } }, { Schema: 'never' });
        });

        test('other schemas leave the type', () => {
            expectGenerated({ type: 'string', not: { pattern: '^a' } }, { Schema: 'string' });
        });
    });
});
