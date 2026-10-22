import { expect } from '@leyman/expect';
import { genever, GeneverStrictModeError } from 'genever';
import { suite, test } from 'mocha-chain';
import { expectGenerated } from '../../lib/expect-generated.js';
import { typeCheck } from '../../lib/type-check.js';

suite('references', () => {
    test('$defs are named types', () => {
        expectGenerated(
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
        const source = genever({
            type: 'object',
            properties: { a: { $ref: '#/$defs/Group/$defs/A' } },
            $defs: { Group: { title: 'Shared', $defs: { A: { type: 'string' } } } },
        });

        expect(source).not.to.contain('Group');
        expect(typeCheck({ 'generated.ts': source })).to.deep.equal([]);
    });

    test('a referenced group is generated', () => {
        expectGenerated(
            {
                type: 'object',
                properties: { group: { $ref: '#/$defs/Group' } },
                $defs: { Group: { $defs: {} } },
            },
            { Schema: '{ group?: Group }', Group: 'unknown' }
        );
    });

    test('unused definitions are generated', () => {
        expectGenerated(
            { type: 'string', definitions: { Other: { type: 'number' } } },
            { Schema: 'string', Other: 'number' }
        );
    });

    test('recursive definition', () => {
        expectGenerated(
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
        expectGenerated(
            {
                type: 'object',
                properties: { parent: { anyOf: [{ $ref: '#' }, { type: 'null' }] } },
            },
            { Schema: '{ parent?: Schema | null }' }
        );
    });

    test('reference to a property', () => {
        expectGenerated(
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
        expectGenerated(
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
        expectGenerated(
            {
                type: 'object',
                properties: { a: { $ref: '#/$defs/A', description: 'An A', nullable: true } },
                $defs: { A: { type: 'string' } },
            },
            { Schema: '{ a?: A | null }', A: 'string' },
            { openApi30: true }
        );
    });

    suite('a reference back to the same value', () => {
        const loose = { strict: false };

        test('is never, outside strict mode', () => {
            expectGenerated(
                { anyOf: [{ $ref: '#' }, { type: 'string' }] },
                { Schema: 'string' },
                loose
            );
            expectGenerated(
                { allOf: [{ $ref: '#' }, { type: 'string' }] },
                { Schema: 'never' },
                loose
            );
        });

        test('is a strict mode error', () => {
            expect(() => genever({ anyOf: [{ $ref: '#' }, { type: 'string' }] }))
                .to.throw(GeneverStrictModeError, /refers back/v)
                .with.property('pointer', '#/anyOf/0/$ref');
        });

        test('through another definition, which is inlined', () => {
            expectGenerated(
                {
                    $defs: {
                        A: { anyOf: [{ $ref: '#/$defs/B' }, { type: 'string' }] },
                        B: { anyOf: [{ $ref: '#/$defs/A' }, { type: 'number' }] },
                    },
                },
                { Schema: 'unknown', A: 'number | string', B: 'string | number' },
                loose
            );
        });

        suite('through each keyword for the same value', () => {
            const shapes: Record<string, (ref: string) => unknown> = {
                allOf: ref => ({ allOf: [{ $ref: ref }] }),
                oneOf: ref => ({ oneOf: [{ $ref: ref }] }),
                if: ref => ({ if: { $ref: ref } }),
                then: ref => ({ if: true, then: { $ref: ref } }),
                else: ref => ({ if: false, else: { $ref: ref } }),
                not: ref => ({ not: { $ref: ref } }),
                dependentSchemas: ref => ({
                    type: 'object',
                    dependentSchemas: { a: { $ref: ref } },
                }),
                dependencies: ref => ({
                    type: 'object',
                    dependencies: { a: { $ref: ref }, b: ['a'] },
                }),
            };
            for (const [keyword, shape] of Object.entries(shapes)) {
                test(keyword, () => {
                    expect(() =>
                        genever({ $defs: { A: shape('#/$defs/B'), B: shape('#/$defs/A') } })
                    ).to.throw(GeneverStrictModeError, /refers back/v);
                });
            }
        });

        test('through a property or item is a recursive type', () => {
            const source = genever({
                $defs: {
                    A: { anyOf: [{ $ref: '#/$defs/B' }, { type: 'string' }] },
                    B: { type: 'array', items: { $ref: '#/$defs/A' } },
                },
            });

            expect(typeCheck({ 'generated.ts': source })).to.deep.equal([]);
        });

        test('an invalid reference is still an error', () => {
            expect(() =>
                genever(
                    {
                        $defs: {
                            A: { anyOf: [{ $ref: '#/$defs/B' }] },
                            B: { anyOf: [{ $ref: '#/$defs/A' }, { $ref: '#/$defs/Missing' }] },
                        },
                    },
                    loose
                )
            ).to.throw(/Missing/v);
        });
    });

    suite('resources and anchors', () => {
        test('an embedded resource resolves its own definitions', () => {
            expectGenerated(
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
            expectGenerated(
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
            expectGenerated(
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
            expectGenerated(
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

        test('an alias of a resource is not a type', () => {
            expectGenerated(
                {
                    type: 'object',
                    properties: { a: { $ref: 'alias.json' } },
                    $defs: {
                        Alias: { $id: 'alias.json', $ref: 'real.json' },
                        Real: { $id: 'real.json', type: 'string' },
                    },
                },
                { Schema: '{ a?: Real }', Real: 'string' }
            );
        });

        test('$anchor', () => {
            expectGenerated(
                {
                    type: 'object',
                    properties: { email: { $ref: '#email' } },
                    $defs: { Email: { $anchor: 'email', type: 'string' } },
                },
                { Schema: '{ email?: Email }', Email: 'string' }
            );
        });

        test('$anchor in an embedded resource', () => {
            expectGenerated(
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
            expectGenerated(
                {
                    type: 'object',
                    properties: { email: { $ref: '#email' } },
                    definitions: { Email: { $id: '#email', type: 'string' } },
                },
                { Schema: '{ email?: Email }', Email: 'string' }
            );
        });

        test('$dynamicAnchor is an anchor', () => {
            expectGenerated(
                {
                    type: 'object',
                    properties: { node: { $ref: '#node' } },
                    $defs: { Node: { $dynamicAnchor: 'node', type: 'string' } },
                },
                { Schema: '{ node?: Node }', Node: 'string' }
            );
        });

        test('reference into an array', () => {
            expectGenerated(
                {
                    type: 'object',
                    properties: { a: { $ref: '#/allOf/0' } },
                    allOf: [{ type: 'object' }],
                },
                { Schema: '{ a?: AllOf0 }', AllOf0: 'Record<string, unknown>' }
            );
        });

        test('reference from an extension keyword', () => {
            expectGenerated(
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
            expectGenerated(
                { $defs: { 'user-profile': { type: 'string' } } },
                { UserProfile: 'string' }
            );
        });

        test('duplicates are numbered', () => {
            expectGenerated(
                { $defs: { Schema: { type: 'string' }, schema: { type: 'number' } } },
                { Schema: 'unknown', Schema2: 'string', Schema3: 'number' }
            );
        });

        test('numbers are prefixed', () => {
            expectGenerated({ $defs: { '1st': { type: 'number' } } }, { T1st: 'number' });
        });

        test('do not shadow types used by generated code', () => {
            expectGenerated(
                { $defs: { record: { type: 'object' } } },
                { Record2: '{ [key: string]: unknown }' }
            );
        });

        test('without letters', () => {
            expectGenerated({ $defs: { '': { type: 'string' } } }, { Type: 'string' });
        });

        test('root name', () => {
            expectGenerated({ type: 'string' }, { Root: 'string' }, { name: 'Root' });
        });

        test('root is first, then other types by name', () => {
            const source = genever({
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
