import type { IdentityPath } from '#internal/lib/schema/identity.js';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parse, x, XeneverInvalidSchemaError } from 'xenever';
import { parseIdentityPaths } from '#internal/lib/schema/identity.js';

/**
 * Parses a selector or field with the prefix `p` bound to `urn:p`.
 *
 * @param text - the path
 * @param isField - whether it is a field
 * @returns its paths
 */
const paths = (text: string, isField = false): readonly IdentityPath[] =>
    parseIdentityPaths(
        text,
        isField,
        prefix => (prefix === 'p' ? 'urn:p' : undefined),
        message => {
            throw new SyntaxError(message);
        }
    );

/**
 * A root `a` with no content and the identity constraints given.
 *
 * @param identity - the `identity` property
 * @returns the declaration
 */
const withIdentity = (identity: unknown): x.Element =>
    ({ kind: 'element', name: 'a', type: { kind: 'complex' }, identity }) as x.Element;

/**
 * Asserts a root declaration is an invalid schema value.
 *
 * @param declaration - the root declaration
 * @param reason - matches the message
 * @param path - path of the error
 */
const expectInvalidSchema = (declaration: x.Element, reason: RegExp, path: string): void => {
    expect(() => parse('<a/>', declaration))
        .to.throw(XeneverInvalidSchemaError, reason)
        .that.includes({ path });
};

suite('Identity constraint schema values', () => {
    suite('Paths', () => {
        test('Reads child steps, `.//` and unions', () => {
            expect(paths('.//a/b | c')).to.deep.equal([
                {
                    isDeep: true,
                    steps: [
                        { namespace: null, localName: 'a' },
                        { namespace: null, localName: 'b' },
                    ],
                    attribute: null,
                },
                {
                    isDeep: false,
                    steps: [{ namespace: null, localName: 'c' }],
                    attribute: null,
                },
            ]);
        });

        test('Reads `.`, wildcards and prefixes, `xml` always bound', () => {
            expect(paths('./*/p:*/p:a/xml:b')).to.deep.equal([
                {
                    isDeep: false,
                    steps: [
                        null,
                        {},
                        { namespace: 'urn:p' },
                        { namespace: 'urn:p', localName: 'a' },
                        { namespace: 'http://www.w3.org/XML/1998/namespace', localName: 'b' },
                    ],
                    attribute: null,
                },
            ]);
        });

        test('Reads a field ending with an attribute', () => {
            expect(paths('a/@p:b | .//@*', true)).to.deep.equal([
                {
                    isDeep: false,
                    steps: [{ namespace: null, localName: 'a' }],
                    attribute: { namespace: 'urn:p', localName: 'b' },
                },
                { isDeep: true, steps: [], attribute: {} },
            ]);
        });

        test('Reads the `child` and `attribute` axes, and whitespace around tokens', () => {
            expect(paths(' child :: a / attribute::b ', true)).to.deep.equal(paths('a/@b', true));
        });

        test('Names that contain dots and dashes are one token', () => {
            expect(paths('a.b-c')).to.deep.equal([
                {
                    isDeep: false,
                    steps: [{ namespace: null, localName: 'a.b-c' }],
                    attribute: null,
                },
            ]);
        });

        for (const [text, isField, reason] of [
            ['', false, /^Expected a name test, not the end$/v],
            ['/a', false, /^Expected a name test, not `\/`$/v],
            ['a//b', false, /^Unexpected `\/\/`$/v],
            ['../a', false, /^`\.\.` is not allowed$/v],
            [' :: a', false, /^`::` is not allowed$/v],
            ['a :: b', false, /^The axis `a` is not allowed; only `child`$/v],
            ['a | ', false, /^Expected a name test, not the end$/v],
            ['@a', false, /^Expected a name test, not `@`$/v],
            ['attribute::a', false, /^The axis `attribute` is not allowed; only `child`$/v],
            [
                'parent::a',
                true,
                /^The axis `parent` is not allowed; only `child` and `attribute`$/v,
            ],
            ['@a/b', true, /^Unexpected `\/`$/v],
            ['child::@a', true, /^Expected a name test, not `@`$/v],
            ['a b', false, /^Unexpected a name$/v],
            ['a child::b', false, /^Unexpected `child::`$/v],
            ['$a', false, /^Unexpected "\$"$/v],
            ['p:', false, /^Expected a local name or `\*` after `p:`$/v],
            ['q:a', false, /^The prefix `q` is not bound to a namespace$/v],
            ['a/child::', false, /^Expected a name test, not the end$/v],
        ] as const) {
            test(`Rejects ${JSON.stringify(text)}${isField ? ' as a field' : ''}`, () => {
                expect(() => paths(text, isField)).to.throw(SyntaxError, reason);
            });
        }
    });

    suite('Builders', () => {
        test('x.key and x.unique build plain data', () => {
            const key = x.key('sku', 'item', ['@sku']);
            expect(key).to.deep.equal({
                kind: 'key',
                name: 'sku',
                selector: 'item',
                fields: ['@sku'],
            });
            expectTypeOf(key.name).toEqualTypeOf<'sku'>();
            expect(
                x.unique('u', 'p:item', ['p:code'], {
                    namespace: 'urn:p',
                    namespaces: { p: 'urn:p' },
                })
            ).to.deep.equal({
                kind: 'unique',
                name: 'u',
                selector: 'p:item',
                fields: ['p:code'],
                namespace: 'urn:p',
                namespaces: { p: 'urn:p' },
            });
        });

        test('x.keyref keeps only the name and namespace of what it refers to', () => {
            const key = x.key('sku', 'item', ['@sku'], { namespace: 'urn:p' });
            expect(x.keyref('line', key, 'line', ['@sku'])).to.deep.equal({
                kind: 'keyref',
                name: 'line',
                refer: { name: 'sku', namespace: 'urn:p' },
                selector: 'line',
                fields: ['@sku'],
            });
            expect(x.keyref('line', { name: 'sku' }, 'line', ['@sku']).refer).to.deep.equal({
                name: 'sku',
            });
        });

        test('Constraints leave the value type alone', () => {
            const plain = x.element('a', x.complex({ attributes: [x.attribute('b', x.int())] }));
            const keyed = x.element('a', x.complex({ attributes: [x.attribute('b', x.int())] }), {
                identity: [x.key('k', '.', ['@b'])],
            });
            expectTypeOf<x.Infer<typeof keyed>>().toEqualTypeOf<x.Infer<typeof plain>>();
            expect(parse('<a b="1"/>', keyed)).to.deep.equal(parse('<a b="1"/>', plain));
        });
    });

    suite('Checks', () => {
        test('Takes an empty list as no constraints', () => {
            expect(parse('<a/>', withIdentity([]))).to.deep.equal({ attributes: {} });
        });

        test('Takes a key object as `refer`', () => {
            const key = x.key('k', 'b', ['@c']);
            const declaration = withIdentity([
                key,
                { ...key, kind: 'keyref', name: 'r', refer: key },
            ]);
            expect(parse('<a/>', declaration)).to.deep.equal({ attributes: {} });
        });

        for (const [description, identity, reason, path] of [
            ['a non-array', {}, /^Expected an array/v, '/identity'],
            [
                'an unknown kind',
                [{ kind: 'primary', name: 'k', selector: 'b', fields: ['@c'] }],
                /^Expected an identity constraint \(`key`, `keyref` or `unique`\), not "primary"/v,
                '/identity/0',
            ],
            [
                'an unknown property',
                [{ kind: 'key', name: 'k', selector: 'b', fields: ['@c'], field: '@d' }],
                /^Unknown property `field`/v,
                '/identity/0',
            ],
            [
                'a name that is not an NCName',
                [{ kind: 'key', name: 'a:k', selector: 'b', fields: ['@c'] }],
                /^Name "a:k" is not an NCName/v,
                '/identity/0/name',
            ],
            [
                'an empty namespace',
                [{ kind: 'key', name: 'k', namespace: '', selector: 'b', fields: ['@c'] }],
                /^A namespace name must not be empty/v,
                '/identity/0/namespace',
            ],
            [
                'two constraints with one name',
                [x.key('k', 'b', ['@c']), x.unique('k', 'b', ['@c'])],
                /^Identity constraint `k` is declared twice/v,
                '/identity/1',
            ],
            [
                'a selector that is not a string',
                [{ kind: 'key', name: 'k', selector: 1, fields: ['@c'] }],
                /^Expected a string/v,
                '/identity/0/selector',
            ],
            [
                'a selector outside the subset',
                [x.key('k', 'b/@c', ['@c'])],
                /^Selector "b\/@c" is not in the XPath subset of identity constraints: Expected a name test, not `@`/v,
                '/identity/0/selector',
            ],
            [
                'a field with a prefix `namespaces` does not bind',
                [x.key('k', 'b', ['@p:c'])],
                /^Field "@p:c" is not in the XPath subset of identity constraints: The prefix `p` is not bound to a namespace/v,
                '/identity/0/fields/0',
            ],
            [
                'no fields',
                [x.key('k', 'b', [])],
                /^An identity constraint has at least one field/v,
                '/identity/0/fields',
            ],
            [
                'namespaces that are not an object',
                [{ kind: 'key', name: 'k', selector: 'b', fields: ['@c'], namespaces: null }],
                /^Expected an object/v,
                '/identity/0/namespaces',
            ],
            [
                'a prefix bound to an empty namespace name',
                [x.key('k', 'b', ['@c'], { namespaces: { p: '' } })],
                /^Expected an NCName prefix bound to a namespace name/v,
                '/identity/0/namespaces/p',
            ],
            [
                'a keyref without refer',
                [{ kind: 'keyref', name: 'r', selector: 'b', fields: ['@c'] }],
                /^A keyref needs `refer`/v,
                '/identity/0',
            ],
            [
                'refer on a key',
                [{ kind: 'key', name: 'k', selector: 'b', fields: ['@c'], refer: { name: 'k' } }],
                /^Only a keyref has `refer`/v,
                '/identity/0/refer',
            ],
            [
                'a refer whose name is not an NCName',
                [x.keyref('r', { name: '' }, 'b', ['@c'])],
                /^Name "" is not an NCName/v,
                '/identity/0/refer/name',
            ],
        ] as const) {
            test(`Rejects ${description}`, () => {
                expectInvalidSchema(withIdentity(identity), reason, path);
            });
        }

        test('Names a constraint by its namespace in errors', () => {
            expectInvalidSchema(
                withIdentity([
                    x.key('k', 'b', ['@c'], { namespace: 'urn:p' }),
                    x.key('k', 'b', ['@c'], { namespace: 'urn:p' }),
                ]),
                /^Identity constraint `k` in `urn:p` is declared twice/v,
                '/identity/1'
            );
        });
    });

    suite('Across the root', () => {
        /**
         * An optional, repeated element with an `id` attribute.
         *
         * @param name - its name
         * @param options - more of its options, or others in place of these
         * @returns the declaration
         */
        const item = (name: string, options: Record<string, unknown> = {}): x.Element => ({
            kind: 'element',
            name,
            type: { kind: 'complex', attributes: [x.attribute('id', x.int())] },
            minOccurs: 0,
            maxOccurs: 'unbounded',
            ...options,
        });

        /**
         * A root `a` holding the particles given.
         *
         * @param particles - its content
         * @param identity - its identity constraints
         * @returns the declaration
         */
        const holding = (particles: readonly unknown[], identity?: readonly unknown[]): x.Element =>
            ({
                kind: 'element',
                name: 'a',
                type: { kind: 'complex', content: { kind: 'sequence', particles } },
                ...(identity && { identity }),
            }) as x.Element;

        test('Rejects two different constraints of one name on different elements', () => {
            const key = x.key('id', 'a', ['@id']);
            expectInvalidSchema(
                holding(
                    [
                        item('as', { identity: [key] }),
                        item('bs', { identity: [x.key('id', 'b', ['@id'])] }),
                        item('ref'),
                    ],
                    [x.keyref('r', key, 'ref', ['@id'])]
                ),
                /^The key `id` is declared twice, differently/v,
                '/type/content/particles/1/identity/0'
            );
        });

        test('Accepts one constraint on several declarations, given again or written twice', () => {
            const key = x.key('id', 'b', ['@id']);
            const declaration = holding(
                [
                    item('as', { identity: [key] }),
                    item('bs', { identity: [key] }),
                    item('cs', { identity: [x.key('id', 'b', ['@id'])] }),
                ],
                [x.keyref('r', { name: 'id' }, 'b', ['@id']), x.keyref('r2', key, 'b', ['@id'])]
            );
            expect(parse('<a/>', declaration)).to.deep.equal({ attributes: {}, children: {} });
        });

        test('Finds constraints through lazy references, recursion included', () => {
            const tree: x.Element = x.element(
                'tree',
                x.complex({
                    content: x.sequence([x.lazy(() => tree, { minOccurs: 0 })]),
                }),
                { identity: [x.key('id', 'b', ['@id'])] }
            );
            expectInvalidSchema(
                holding([x.lazy(() => tree)], [x.unique('id', 'b', ['@id'])]),
                /^The key `id` is declared twice, differently/v,
                '/type/content/particles/0/get()/identity/0'
            );
        });

        test('Finds constraints through the declarations of wildcards', () => {
            expectInvalidSchema(
                holding(
                    [
                        x.any({ processContents: 'skip' }),
                        x.any({
                            declarations: () => [
                                item('b', { identity: [x.unique('id', 'b', ['@id'])] }),
                            ],
                        }),
                    ],
                    [x.key('id', 'b', ['@id'])]
                ),
                /^The unique `id` is declared twice, differently/v,
                '/type/content/particles/1/declarations()/0/identity/0'
            );
        });

        test('Finds constraints through the types xsi:type may select, each type once', () => {
            const shared = x.complex({
                content: x.sequence([item('b', { identity: [x.unique('id', 'b', ['@id'])] })]),
            });
            const derived = x.complex({
                name: 'Derived',
                content: x.sequence([item('c', { type: shared })]),
            });
            const base = x.complex({ name: 'Base' });
            expectInvalidSchema(
                holding(
                    [
                        item('d', { type: shared }),
                        item('e', {
                            type: base,
                            types: () => [derived],
                            minOccurs: 1,
                            maxOccurs: 1,
                        }),
                        item('f', { type: x.string() }),
                    ],
                    [x.unique('id', 'c', ['@id'])]
                ),
                /^The unique `id` is declared twice, differently/v,
                '/type/content/particles/0/type/content/particles/0/identity/0'
            );
        });

        test('Rejects a keyref referring to nothing, though no document reaches it', () => {
            expectInvalidSchema(
                holding([item('b')], [x.keyref('r', { name: 'typo' }, 'b', ['@id'])]),
                /^The keyref `r` refers to `typo`, which names no identity constraint/v,
                '/identity/0/refer'
            );
        });

        test('Rejects a keyref referring to a keyref', () => {
            const keyref = x.keyref('r', { name: 'k' }, 'b', ['@id']);
            expectInvalidSchema(
                holding(
                    [item('b')],
                    [x.key('k', 'b', ['@id']), keyref, x.keyref('r2', keyref, 'b', ['@id'])]
                ),
                /^The keyref `r2` refers to the keyref `r`, which is not a key or unique constraint/v,
                '/identity/2/refer'
            );
        });

        test('Rejects a keyref with a number of fields other than its key', () => {
            expectInvalidSchema(
                holding(
                    [item('b')],
                    [x.key('k', 'b', ['@id']), x.keyref('r', { name: 'k' }, 'b', ['@id', '@id'])]
                ),
                /^The keyref `r` has 2 fields, and the key `k` it refers to 1/v,
                '/identity/1/fields'
            );
        });

        test('Resolves a keyref to a key of an element it holds, declared after it', () => {
            const declaration = holding(
                [item('b', { identity: [x.key('k', 'c', ['@id'])] })],
                [x.keyref('r', { name: 'k' }, 'b/c', ['@id'])]
            );
            expect(parse('<a><b/></a>', declaration)).to.deep.equal({
                attributes: {},
                children: { b: [{ attributes: {} }] },
            });
        });
    });
});
