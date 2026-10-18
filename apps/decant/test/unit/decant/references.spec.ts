import { expect } from '@leyman/expect';
import { decant } from 'decant';
import { suite, test } from 'mocha-chain';
import { expectDecanted } from '../../lib/expect-decanted.js';
import { typeCheck } from '../../lib/type-check.js';

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

    test('a definition that only groups definitions is not generated', () => {
        const source = decant({
            type: 'object',
            properties: { a: { $ref: '#/$defs/Group/$defs/A' } },
            $defs: { Group: { title: 'Shared', $defs: { A: { type: 'string' } } } },
        });

        expect(source).not.to.contain('Group');
        expect(typeCheck({ 'decanted.ts': source })).to.deep.equal([]);
    });

    test('a referenced group is generated', () => {
        expectDecanted(
            {
                type: 'object',
                properties: { group: { $ref: '#/$defs/Group' } },
                $defs: { Group: { $defs: {} } },
            },
            { Schema: '{ group?: Group }', Group: 'unknown' }
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

    suite('resources and anchors', () => {
        test('an embedded resource resolves its own definitions', () => {
            expectDecanted(
                {
                    $defs: {
                        Currency: { type: 'number' },
                        Money: {
                            $id: 'https://example.test/money',
                            type: 'object',
                            properties: { currency: { $ref: '#/$defs/Currency' } },
                            $defs: { Currency: { enum: ['USD', 'EUR'] } },
                        },
                    },
                },
                {
                    Currency: 'number',
                    Money: '{ currency?: Currency2 }',
                    Currency2: '"USD" | "EUR"',
                }
            );
        });

        test('# in an embedded resource is that resource', () => {
            expectDecanted(
                {
                    $defs: {
                        Tree: {
                            $id: 'tree.json',
                            type: 'object',
                            properties: { children: { type: 'array', items: { $ref: '#' } } },
                            required: ['children'],
                        },
                    },
                },
                { Tree: '{ children: Tree[] }' }
            );
        });

        test('relative $id and $ref', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: { home: { $ref: './common/address.json' } },
                    $defs: {
                        'common/address.json': {
                            $id: 'common/address.json',
                            type: 'object',
                            properties: { country: { $ref: 'country.json' } },
                        },
                        'common/country.json': { $id: 'common/country.json', enum: ['US', 'FR'] },
                    },
                },
                {
                    Schema: '{ home?: CommonAddressJson }',
                    CommonAddressJson: '{ country?: CommonCountryJson }',
                    CommonCountryJson: '"US" | "FR"',
                }
            );
        });

        test('absolute root $id', () => {
            expectDecanted(
                {
                    $id: 'https://example.test/schemas/user.json',
                    type: 'object',
                    properties: { home: { $ref: 'address.json' }, self: { $ref: 'user.json' } },
                    $defs: {
                        Address: {
                            $id: 'https://example.test/schemas/address.json',
                            type: 'string',
                        },
                    },
                },
                { Schema: '{ home?: Address; self?: Schema }', Address: 'string' }
            );
        });

        test('$anchor', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: { email: { $ref: '#email' } },
                    $defs: { Email: { $anchor: 'email', type: 'string' } },
                },
                { Schema: '{ email?: Email }', Email: 'string' }
            );
        });

        test('$anchor in an embedded resource', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: {
                        code: { $ref: 'money.json#code' },
                        amount: { $ref: 'money.json#/$defs/Amount' },
                    },
                    $defs: {
                        Money: {
                            $id: 'money.json',
                            $defs: {
                                Code: { $anchor: 'code', type: 'string' },
                                Amount: { type: 'number' },
                            },
                        },
                    },
                },
                { Schema: '{ code?: Code; amount?: Amount }', Code: 'string', Amount: 'number' }
            );
        });

        test('draft 7 $id anchor', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: { email: { $ref: '#email' } },
                    definitions: { Email: { $id: '#email', type: 'string' } },
                },
                { Schema: '{ email?: Email }', Email: 'string' }
            );
        });

        test('$dynamicAnchor is an anchor', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: { node: { $ref: '#node' } },
                    $defs: { Node: { $dynamicAnchor: 'node', type: 'string' } },
                },
                { Schema: '{ node?: Node }', Node: 'string' }
            );
        });

        test('reference into an array', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: { a: { $ref: '#/allOf/0' } },
                    allOf: [{ type: 'object' }],
                },
                { Schema: '{ a?: AllOf0 }', AllOf0: 'Record<string, unknown>' }
            );
        });

        test('reference from an extension keyword', () => {
            expectDecanted(
                {
                    type: 'object',
                    properties: { a: { $ref: '#/x-shared' } },
                    'x-shared': { $ref: '#/$defs/A' },
                    $defs: { A: { type: 'string' } },
                },
                { Schema: '{ a?: XShared }', XShared: 'A', A: 'string' }
            );
        });
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
