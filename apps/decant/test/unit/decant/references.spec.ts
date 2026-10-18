import { expect } from '@leyman/expect';
import { decant } from 'decant';
import { suite, test } from 'mocha-chain';
import { expectDecanted } from '../../lib/expect-decanted.js';

suite('references', () => {
    test('$defs are named types', () => {
        expectDecanted(
            {
                type: 'object',
                properties: { home: { $ref: '#/$defs/Address' } },
                $defs: {
                    Address: {
                        type: 'object',
                        properties: { city: { type: 'string' } },
                        required: ['city'],
                    },
                },
            },
            { Schema: '{ home?: Address }', Address: '{ city: string }' }
        );
    });

    test('unused definitions are generated', () => {
        expectDecanted(
            { type: 'string', definitions: { Other: { type: 'number' } } },
            { Schema: 'string', Other: 'number' }
        );
    });

    test('recursive definition', () => {
        expectDecanted(
            {
                $ref: '#/$defs/Tree',
                $defs: {
                    Tree: {
                        type: 'object',
                        properties: {
                            children: { type: 'array', items: { $ref: '#/$defs/Tree' } },
                        },
                        required: ['children'],
                    },
                },
            },
            { Schema: 'Tree', Tree: '{ children: Tree[] }' }
        );
    });

    test('recursive root', () => {
        expectDecanted(
            {
                type: 'object',
                properties: { parent: { anyOf: [{ $ref: '#' }, { type: 'null' }] } },
            },
            { Schema: '{ parent?: Schema | null }' }
        );
    });

    test('reference to a property', () => {
        expectDecanted(
            {
                type: 'object',
                properties: {
                    a: { type: 'string' },
                    b: { $ref: '#/properties/a' },
                },
            },
            { Schema: '{ a?: string; b?: PropertiesA }', PropertiesA: 'string' }
        );
    });

    test('escaped and encoded pointers', () => {
        expectDecanted(
            {
                type: 'object',
                properties: {
                    a: { $ref: '#/$defs/a~1b~0c' },
                    b: { $ref: '#/%24defs/a~1b~0c' },
                },
                $defs: { 'a/b~c': { type: 'string' } },
            },
            { Schema: '{ a?: ABC; b?: ABC }', ABC: 'string' }
        );
    });

    test('reference with other keywords', () => {
        expectDecanted(
            {
                type: 'object',
                properties: { a: { $ref: '#/$defs/A', description: 'An A', nullable: true } },
                $defs: { A: { type: 'string' } },
            },
            { Schema: '{ a?: A | null }', A: 'string' },
            { openApi30: true }
        );
    });

    suite('names', () => {
        test('are PascalCase', () => {
            expectDecanted(
                { $defs: { 'user-profile': { type: 'string' } } },
                { UserProfile: 'string' }
            );
        });

        test('duplicates are numbered', () => {
            expectDecanted(
                { $defs: { Schema: { type: 'string' }, schema: { type: 'number' } } },
                { Schema: 'unknown', Schema2: 'string', Schema3: 'number' }
            );
        });

        test('numbers are prefixed', () => {
            expectDecanted({ $defs: { '1st': { type: 'number' } } }, { T1st: 'number' });
        });

        test('do not shadow types used by generated code', () => {
            expectDecanted(
                { $defs: { record: { type: 'object' } } },
                { Record2: '{ [key: string]: unknown }' }
            );
        });

        test('without letters', () => {
            expectDecanted({ $defs: { '': { type: 'string' } } }, { Type: 'string' });
        });

        test('root name', () => {
            expectDecanted({ type: 'string' }, { Root: 'string' }, { name: 'Root' });
        });

        test('root is first, then other types by name', () => {
            const source = decant({
                type: 'object',
                properties: { a: { type: 'string' }, b: { $ref: '#/properties/a' } },
                $defs: { Z: true, B: true },
            });

            expect(source.indexOf('Schema')).to.be.lessThan(source.indexOf('type B'));
            expect(source.indexOf('type B')).to.be.lessThan(source.indexOf('type PropertiesA'));
            expect(source.indexOf('type PropertiesA')).to.be.lessThan(source.indexOf('type Z'));
        });
    });
});
