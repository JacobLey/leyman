/* eslint-disable no-template-curly-in-string -- expected types are TypeScript source, with template literal types */
import { expect } from '@leyman/expect';
import { decant } from 'decant';
import { suite, test } from 'mocha-chain';
import { expectDecanted } from '../../lib/expect-decanted.js';
import { typeCheck } from '../../lib/type-check.js';

suite('objects', () => {
    test('properties and required', () => {
        expectDecanted(
            {
                type: 'object',
                properties: { a: { type: 'string' }, b: { type: 'number' } },
                required: ['a'],
            },
            { Schema: '{ a: string; b?: number }' }
        );
    });

    test('property names that are not identifiers', () => {
        expectDecanted(
            {
                type: 'object',
                properties: { 'a-b': { type: 'string' }, '1': { type: 'number' } },
                required: ['a-b'],
            },
            { Schema: '{ "a-b": string; "1"?: number }' }
        );
    });

    test('false property can not be set', () => {
        expectDecanted({ type: 'object', properties: { a: false } }, { Schema: '{ a?: never }' });
    });

    test('no properties is any object', () => {
        expectDecanted({ type: 'object' }, { Schema: 'Record<string, unknown>' });
    });

    test('no properties allowed', () => {
        expectDecanted(
            { type: 'object', additionalProperties: false },
            { Schema: 'Record<string, never>' }
        );
    });

    suite('additionalProperties', () => {
        test('true', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: { a: { type: 'string' } },
                    additionalProperties: true,
                },
                { Schema: '{ a?: string; [key: string]: unknown }' }
            );
        });

        test('false', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: { a: { type: 'string' } },
                    additionalProperties: false,
                },
                { Schema: '{ a?: string }' }
            );
        });

        test('schema', () => {
            expectDecanted(
                { type: 'object', additionalProperties: { type: 'number' } },
                { Schema: 'Record<string, number>' }
            );
        });

        test('schema with properties of another type', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: { a: { type: 'string' } },
                    required: ['a'],
                    additionalProperties: { type: 'number' },
                },
                { Schema: '{ a: string } & Record<string, number>' }
            );
        });
    });

    suite('patternProperties', () => {
        test('prefix', () => {
            expectDecanted(
                { type: 'object', patternProperties: { '^x-': { type: 'string' } } },
                { Schema: 'Record<`x-${string}`, string>' }
            );
        });

        test('any pattern', () => {
            expectDecanted(
                { type: 'object', patternProperties: { '^[a-z]+$': { type: 'string' } } },
                { Schema: 'Record<string, string>' }
            );
        });

        test('exact key is a property', () => {
            expectDecanted(
                { type: 'object', patternProperties: { '^abc$': { type: 'string' } } },
                { Schema: '{ abc?: string }' }
            );
        });

        test('with additionalProperties true', () => {
            expectDecanted(
                {
                    type: 'object',
                    patternProperties: { '^x-': { type: 'string' } },
                    additionalProperties: true,
                },
                { Schema: 'Record<string, unknown> & Record<`x-${string}`, string>' }
            );
        });

        test('with additionalProperties and no properties', () => {
            expectDecanted(
                {
                    type: 'object',
                    patternProperties: { '^x-': { type: 'string' } },
                    additionalProperties: { type: 'number' },
                },
                { Schema: 'Record<`x-${string}`, string> & Record<string, number>' }
            );
        });

        test('with additionalProperties', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: { a: { type: 'boolean' } },
                    patternProperties: { '^x-': { type: 'string' } },
                    additionalProperties: { type: 'number' },
                },
                {
                    Schema: '{ a?: boolean } & Record<`x-${string}`, string> & Record<string, number>',
                }
            );
        });
    });

    suite('required', () => {
        test('required inherited from a parent', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: { a: { type: 'string' } },
                    allOf: [{ required: ['a'] }],
                },
                { Schema: '{ a: string }' }
            );
        });

        test('required without a property is unknown', () => {
            expectDecanted(
                { type: 'object', required: ['a'] },
                { Schema: '{ a: unknown }' },
                { strict: false }
            );
        });
    });

    suite('dependents', () => {
        test('dependentRequired', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: { a: { type: 'string' }, b: { type: 'number' } },
                    dependentRequired: { a: ['b'] },
                },
                { Schema: '{ a?: string; b?: number } & ({ a?: never } | { b: number })' }
            );
        });

        test('dependentRequired on an undeclared property', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: { a: { type: 'string' } },
                    dependentRequired: { a: ['b'] },
                },
                { Schema: '{ a?: string } & ({ a?: never } | { b: unknown })' }
            );
        });

        test('dependentSchemas', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: { a: { type: 'string' }, b: { type: 'number' } },
                    dependentSchemas: { a: { required: ['b'] } },
                },
                { Schema: '{ a?: string; b?: number } & ({ a?: never } | { b: number })' }
            );
        });

        test('dependencies (draft 7)', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: {
                        a: { type: 'string' },
                        b: { type: 'number' },
                        c: { type: 'boolean' },
                    },
                    dependencies: { a: ['b'], c: { required: ['a'] } },
                },
                {
                    Schema: '{ a?: string; b?: number; c?: boolean } & ({ a?: never } | { b: number }) & ({ c?: never } | { a: string })',
                }
            );
        });

        test('only dependents', () => {
            expectDecanted(
                { type: 'object', dependentRequired: { a: [] } },
                { Schema: 'Record<string, unknown> & ({ a?: never } | {})' }
            );
        });
    });

    suite('documentation', () => {
        const documented = {
            type: 'object',
            title: 'Root',
            description: 'Multiple\nlines, and a */ comment end',
            properties: {
                a: { type: 'string', deprecated: true },
                b: { type: 'string', description: 'B' },
                c: { type: 'string', title: 42, description: false },
            },
        };

        test('is written as JSDoc', () => {
            const source = decant(documented);

            expect(source).to.contain('@deprecated');
            expect(source).to.contain(' * B');
            expect(source).to.contain('Multiple');
        });

        test('compiles', () => {
            expect(typeCheck({ 'decanted.ts': decant(documented) })).to.deep.equal([]);
        });
    });
});
