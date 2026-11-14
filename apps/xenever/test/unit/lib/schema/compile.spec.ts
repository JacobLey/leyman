import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parse, x, XeneverInvalidSchemaError, XeneverUnsupportedError } from 'xenever';

/**
 * Asserts a root declaration is an invalid schema value.
 *
 * @param declaration - the root declaration
 * @param reason - matches the message
 * @param path - path to the invalid construct
 */
const expectInvalidSchema = (declaration: unknown, reason: RegExp, path: string): void => {
    expect(() => parse('<a/>', declaration as x.Element))
        .to.throw(XeneverInvalidSchemaError, reason)
        .that.includes({ path });
};

/**
 * A root `a` with a complex type.
 *
 * @param type - the complex type's properties
 * @returns the declaration
 */
const root = (type: Record<string, unknown>): unknown => ({
    kind: 'element',
    name: 'a',
    type: { kind: 'complex', ...type },
});

/**
 * A root `a` with a content model.
 *
 * @param content - the content model
 * @returns the declaration
 */
const withContent = (content: unknown): unknown => root({ content });

suite('Schema checks', () => {
    suite('Elements', () => {
        test('Rejects what is not an object', () => {
            expectInvalidSchema(null, /Expected an object \(at \/\)/v, '/');
            expectInvalidSchema([], /Expected an object/v, '/');
        });

        test('Rejects another kind as the root', () => {
            expectInvalidSchema(
                x.attribute('a', x.int()),
                /Unknown property `type`|Expected an element declaration/v,
                '/'
            );
            expectInvalidSchema(
                { kind: 'attribute', name: 'a', type: { kind: 'int' } },
                /Expected an element declaration, not "attribute"/v,
                '/'
            );
        });

        test('Rejects an unknown property', () => {
            expectInvalidSchema(
                { kind: 'element', name: 'a', type: { kind: 'int' }, minOccur: 0 },
                /Unknown property `minOccur`/v,
                '/'
            );
        });

        test('Rejects a name that is not an NCName', () => {
            expectInvalidSchema(x.element('a:b', x.int()), /Name "a:b" is not an NCName/v, '/name');
            expectInvalidSchema(
                { kind: 'element', name: 1, type: { kind: 'int' } },
                /Name 1 is not an NCName/v,
                '/name'
            );
        });

        test('Rejects an empty namespace', () => {
            expectInvalidSchema(
                x.element('a', x.int(), { namespace: '' }),
                /must not be empty; leave it out/v,
                '/namespace'
            );
            expectInvalidSchema(
                x.element('a', x.int(), { namespace: 1 as unknown as string }),
                /Expected a string/v,
                '/namespace'
            );
        });

        test('Rejects an empty key or one starting with #', () => {
            expectInvalidSchema(
                x.element('a', x.int(), { key: '' }),
                /A key must not be empty or start with `#`/v,
                '/key'
            );
            expectInvalidSchema(x.element('a', x.int(), { key: '#a' }), /start with `#`/v, '/key');
        });

        test('Rejects invalid occurrences', () => {
            expectInvalidSchema(
                x.element('a', x.int(), { minOccurs: -1 }),
                /at least 0/v,
                '/minOccurs'
            );
            expectInvalidSchema(
                x.element('a', x.int(), { maxOccurs: 0 }),
                /at least 1/v,
                '/maxOccurs'
            );
            expectInvalidSchema(
                x.element('a', x.int(), { maxOccurs: 'many' as never }),
                /at least 1/v,
                '/maxOccurs'
            );
            expectInvalidSchema(
                x.element('a', x.int(), { minOccurs: 3, maxOccurs: 2 }),
                /`maxOccurs` is less than `minOccurs`/v,
                '/maxOccurs'
            );
        });

        test('Rejects an unknown type', () => {
            expectInvalidSchema(
                { kind: 'element', name: 'a', type: { kind: 'text' } },
                /Unknown simple type kind "text"/v,
                '/type'
            );
        });

        test('Rejects an invalid list item', () => {
            expectInvalidSchema(
                x.element('a', x.list(x.list(x.int()) as never)),
                /must not be or contain a list/v,
                '/type/item'
            );
            expectInvalidSchema(
                x.element('a', x.list(x.union([x.list(x.int())]))),
                /must not be or contain a list/v,
                '/type/item'
            );
        });

        test('Rejects a union without members', () => {
            expectInvalidSchema(
                x.element('a', x.union([])),
                /at least one member/v,
                '/type/members'
            );
            expectInvalidSchema(
                x.element('a', x.union([{ kind: 'nope' } as never])),
                /Unknown simple type kind/v,
                '/type/members/0'
            );
        });
    });

    suite('Complex types', () => {
        test('Rejects an unknown property', () => {
            expectInvalidSchema(root({ mixd: true }), /Unknown property `mixd`/v, '/type');
        });

        test('Rejects both content and text', () => {
            expectInvalidSchema(
                root({ content: x.sequence([]), text: x.string() }),
                /either `content` or `text`/v,
                '/type'
            );
        });

        test('Rejects attributes that are not an array', () => {
            expectInvalidSchema(root({ attributes: {} }), /Expected an array/v, '/type/attributes');
        });

        test('Rejects an invalid attribute', () => {
            expectInvalidSchema(
                root({ attributes: [x.element('b', x.int())] }),
                /Expected an attribute declaration|Unknown property/v,
                '/type/attributes/0'
            );
            expectInvalidSchema(
                root({ attributes: [{ kind: 'element', name: 'b', type: { kind: 'int' } }] }),
                /Expected an attribute declaration, not "element"/v,
                '/type/attributes/0'
            );
            expectInvalidSchema(
                root({ attributes: [x.attribute('b', x.int(), { use: 'prohibited' as never })] }),
                /`use` must be `optional` or `required`/v,
                '/type/attributes/0/use'
            );
            expectInvalidSchema(
                root({ attributes: [x.attribute('b', x.complex() as never)] }),
                /Unknown simple type kind "complex"/v,
                '/type/attributes/0/type'
            );
        });

        test('Rejects an attribute declared twice', () => {
            expectInvalidSchema(
                root({ attributes: [x.attribute('b', x.int()), x.attribute('b', x.token())] }),
                /Attribute `b` is declared twice/v,
                '/type/attributes/1'
            );
        });

        test('Rejects an attribute key used twice', () => {
            expectInvalidSchema(
                root({
                    attributes: [
                        x.attribute('b', x.int()),
                        x.attribute('c', x.int(), { key: 'b' }),
                    ],
                }),
                /Attribute key `b` is used twice/v,
                '/type/attributes/1'
            );
        });
    });

    suite('Content models', () => {
        test('Rejects content that is not a model group', () => {
            expectInvalidSchema(
                withContent(x.element('b', x.int())),
                /Expected a model group|Unknown property/v,
                '/type/content'
            );
            expectInvalidSchema(
                withContent({ kind: 'element', particles: [] }),
                /Expected a model group, not "element"/v,
                '/type/content'
            );
        });

        test('Rejects particles that are not an array', () => {
            expectInvalidSchema(
                withContent({ kind: 'sequence', particles: {} }),
                /Expected an array/v,
                '/type/content/particles'
            );
        });

        test('Rejects an invalid particle', () => {
            expectInvalidSchema(
                withContent(x.sequence([{ kind: 'nope' } as never])),
                /Expected an element declaration|Unknown property/v,
                '/type/content/particles/0'
            );
            expectInvalidSchema(
                withContent(
                    x.sequence([
                        { kind: 'element', name: 'b', type: { kind: 'int' }, maxOccurs: 0 },
                    ] as never)
                ),
                /at least 1/v,
                '/type/content/particles/0/maxOccurs'
            );
        });

        test('Rejects a lazy reference without a getter', () => {
            expectInvalidSchema(
                withContent(x.sequence([{ kind: 'lazy', get: 1 } as never])),
                /Expected `get` to be a function/v,
                '/type/content/particles/0/get'
            );
        });

        test('Rejects an invalid declaration behind a lazy reference', () => {
            expectInvalidSchema(
                withContent(x.sequence([x.lazy(() => x.element('1', x.int()))])),
                /Name "1" is not an NCName/v,
                '/type/content/particles/0/get()/name'
            );
        });

        test('Rejects an all group occurring more than once', () => {
            expectInvalidSchema(
                withContent(x.all([], { maxOccurs: 2 })),
                /occurs at most once/v,
                '/type/content/maxOccurs'
            );
        });

        test('Rejects a group in an all group', () => {
            expectInvalidSchema(
                withContent(x.all([x.sequence([])])),
                /holds only elements/v,
                '/type/content/particles/0'
            );
        });

        test('Rejects an element declared twice with different types', () => {
            expectInvalidSchema(
                withContent(x.sequence([x.element('b', x.int()), x.element('b', x.token())])),
                /Element `b` is declared twice in one content model, with different types/v,
                '/type/content/particles/1'
            );
        });

        test('Rejects an element declared twice with one type but different value constraints', () => {
            expectInvalidSchema(
                withContent(
                    x.sequence([
                        x.element('b', x.int(), { default: '1' }),
                        x.element('b', x.int(), { default: '2' }),
                    ])
                ),
                /Element `b` is declared twice in one content model with the same type but otherwise differently/v,
                '/type/content/particles/1'
            );
        });

        test('Accepts an element declared twice the same way, occurrences aside', () => {
            const a = x.element(
                'a',
                x.complex({
                    content: x.sequence([
                        x.element('b', x.int({ enumeration: [1] })),
                        x.element('b', x.int({ enumeration: [1] }), { minOccurs: 0 }),
                    ]),
                })
            );
            expect(parse('<a><b>1</b></a>', a).children).to.deep.equal({ b: [1] });
        });

        test('Accepts an element declared twice with properties in another order', () => {
            const a = x.element(
                'a',
                x.complex({
                    content: x.sequence([
                        { kind: 'element', name: 'b', type: x.int(), default: '1' },
                        { default: '1', type: x.int(), name: 'b', kind: 'element' },
                    ] as x.Element[]),
                })
            );
            expect(parse('<a><b/><b>2</b></a>', a).children).to.deep.equal({ b: [1, 2] });
        });

        test('Rejects a key used by two elements', () => {
            expectInvalidSchema(
                withContent(
                    x.sequence([
                        x.element('b', x.int()),
                        x.element('b', x.int(), { namespace: 'urn:b' }),
                    ])
                ),
                /Key `b` is used by two elements in one content model; set `key` on one/v,
                '/type/content/particles/1'
            );
        });
    });

    suite('Ordered and mixed content', () => {
        test('Rejects ordered or mixed without content', () => {
            expectInvalidSchema(
                root({ ordered: true }),
                /`ordered` needs `content`/v,
                '/type/ordered'
            );
            expectInvalidSchema(
                root({ mixed: true, text: { kind: 'string' } }),
                /`mixed` needs `content`; for text only, use `text`/v,
                '/type/mixed'
            );
        });

        test('Rejects mixed content that is not ordered', () => {
            expectInvalidSchema(
                root({ mixed: true, ordered: false, content: x.sequence([]) }),
                /Mixed content is always ordered/v,
                '/type/ordered'
            );
        });

        test('Rejects a flag that is not a boolean', () => {
            expectInvalidSchema(
                root({ mixed: 'yes', content: x.sequence([]) }),
                /Expected a boolean/v,
                '/type/mixed'
            );
        });
    });

    suite('Wildcards', () => {
        test('Rejects both namespace and notNamespace', () => {
            expectInvalidSchema(
                withContent(x.sequence([x.any({ namespace: ['urn:a'], notNamespace: [null] })])),
                /either `namespace` or `notNamespace`/v,
                '/type/content/particles/0'
            );
        });

        test('Rejects an empty namespace list', () => {
            expectInvalidSchema(
                root({ attributes: [x.anyAttribute({ namespace: [] })] }),
                /allows nothing/v,
                '/type/attributes/0/namespace'
            );
        });

        test('Rejects a namespace that is not a name or null', () => {
            expectInvalidSchema(
                withContent(x.sequence([x.any({ notNamespace: ['urn:a', ''] })])),
                /Expected a namespace name, or `null` for no namespace/v,
                '/type/content/particles/0/notNamespace/1'
            );
            expectInvalidSchema(
                withContent({ kind: 'sequence', particles: [{ kind: 'any', namespace: [1] }] }),
                /Expected a namespace name/v,
                '/type/content/particles/0/namespace/0'
            );
        });

        test('Rejects two attribute wildcards', () => {
            expectInvalidSchema(
                root({ attributes: [x.anyAttribute(), x.anyAttribute()] }),
                /at most one attribute wildcard/v,
                '/type/attributes/1'
            );
        });

        test('Rejects an unknown processContents', () => {
            expectInvalidSchema(
                withContent({
                    kind: 'sequence',
                    particles: [{ kind: 'any', processContents: 'none' }],
                }),
                /`processContents` must be `skip`, `lax` or `strict`/v,
                '/type/content/particles/0/processContents'
            );
        });

        test('Rejects declarations that are not a getter of an array', () => {
            expectInvalidSchema(
                root({ attributes: [{ kind: 'anyAttribute', declarations: [] }] }),
                /Expected `declarations` to be a function/v,
                '/type/attributes/0/declarations'
            );
            expectInvalidSchema(
                withContent({
                    kind: 'sequence',
                    particles: [{ kind: 'any', declarations: () => 'a' }],
                }),
                /Expected an array/v,
                '/type/content/particles/0/declarations()'
            );
        });

        test('Checks each declaration', () => {
            expectInvalidSchema(
                withContent({
                    kind: 'sequence',
                    particles: [
                        { kind: 'any', declarations: () => [{ kind: 'element', name: '1a' }] },
                    ],
                }),
                /is not an NCName/v,
                '/type/content/particles/0/declarations()/0/name'
            );
        });

        test('Rejects two declarations of one name', () => {
            expectInvalidSchema(
                withContent(
                    x.sequence([
                        x.any({
                            declarations: () => [
                                x.element('a', x.int()),
                                x.element('a', x.string()),
                            ],
                        }),
                    ])
                ),
                /Element `a` is declared twice/v,
                '/type/content/particles/0/declarations()/1'
            );
            expectInvalidSchema(
                root({
                    attributes: [
                        x.anyAttribute({
                            declarations: () => [
                                x.attribute('a', x.int(), { namespace: 'urn:a' }),
                                x.attribute('a', x.int(), { namespace: 'urn:a' }),
                            ],
                        }),
                    ],
                }),
                /Attribute `a` in `urn:a` is declared twice/v,
                '/type/attributes/0/declarations()/1'
            );
        });

        test('Rejects an unknown property', () => {
            expectInvalidSchema(
                withContent({
                    kind: 'sequence',
                    particles: [{ kind: 'any', process: 'lax' }],
                }),
                /Unknown property `process`/v,
                '/type/content/particles/0'
            );
            expectInvalidSchema(
                root({ attributes: [{ kind: 'anyAttribute', minOccurs: 0 }] }),
                /Unknown property `minOccurs`/v,
                '/type/attributes/0'
            );
        });

        test('Rejects a group in an all group', () => {
            expectInvalidSchema(
                withContent(x.all([x.sequence([])])),
                /An `all` group holds only elements and wildcards/v,
                '/type/content/particles/0'
            );
        });
    });

    suite('Nil, default and fixed', () => {
        test('Rejects nillable that is not a boolean', () => {
            expectInvalidSchema(
                { kind: 'element', name: 'a', type: { kind: 'int' }, nillable: 1 },
                /Expected a boolean/v,
                '/nillable'
            );
        });

        test('Rejects both default and fixed', () => {
            expectInvalidSchema(
                x.element('a', x.int(), { default: '1', fixed: '1' }),
                /either `default` or `fixed`, not both/v,
                '/'
            );
            expectInvalidSchema(
                root({ attributes: [x.attribute('b', x.int(), { default: '1', fixed: '1' })] }),
                /either `default` or `fixed`/v,
                '/type/attributes/0'
            );
        });

        test('Rejects a value that is not valid for the type', () => {
            expectInvalidSchema(
                x.element('a', x.int(), { default: 'x' }),
                /`default` is not valid for the type: .*int/v,
                '/default'
            );
            expectInvalidSchema(
                root({ attributes: [x.attribute('b', x.int(), { fixed: '1.5' })] }),
                /`fixed` is not valid for the type/v,
                '/type/attributes/0/fixed'
            );
            expectInvalidSchema(
                { kind: 'element', name: 'a', type: { kind: 'int' }, default: 1 },
                /Expected a string/v,
                '/default'
            );
        });

        test('Rejects a value for an ID, but not for a list or union of IDs', () => {
            expectInvalidSchema(
                x.element('a', x.complex({ text: x.id() }), { default: 'i' }),
                /An `ID` can not have a `default`/v,
                '/default'
            );
            expectInvalidSchema(
                root({
                    attributes: [
                        x.attribute('b', { kind: 'ID', facets: { maxLength: 5 } }, { fixed: 'i' }),
                    ],
                }),
                /An `ID` can not have a `fixed`/v,
                '/type/attributes/0/fixed'
            );
            const element = root({
                attributes: [
                    x.attribute('b', x.list(x.id()), { fixed: 'i j' }),
                    x.attribute('c', x.union([x.id(), x.int()]), { default: 'i' }),
                ],
            }) as x.Element;
            expect(parse('<a/>', element)).to.deep.equal({ attributes: { b: ['i', 'j'], c: 'i' } });
        });

        test('Rejects a value for an element without text', () => {
            expectInvalidSchema(
                x.element('a', x.complex(), { default: '' }),
                /`default` needs a simple type or a complex type with `text`/v,
                '/default'
            );
            expectInvalidSchema(
                x.element('a', x.complex({ content: x.sequence([]) }), { fixed: 'x' }),
                /`fixed` needs a simple type/v,
                '/fixed'
            );
        });

        test('Rejects a required attribute with a default', () => {
            expectInvalidSchema(
                root({
                    attributes: [x.attribute('b', x.int(), { use: 'required', default: '1' })],
                }),
                /must not be required/v,
                '/type/attributes/0/default'
            );
        });

        test('Rejects a value of a type that may be a QName as unsupported', () => {
            expect(() => parse('<a/>', x.element('a', x.qname(), { default: 'p:q' })))
                .to.throw(XeneverUnsupportedError, /QName/v)
                .that.includes({ path: '/default' });
            expect(() =>
                parse(
                    '<a/>',
                    x.element('a', x.complex({ mixed: true, content: x.sequence([]) }), {
                        fixed: 'x',
                    })
                )
            )
                .to.throw(XeneverUnsupportedError, /mixed content/v)
                .that.includes({ path: '/fixed' });
            expect(() =>
                parse(
                    '<a/>',
                    x.element('a', x.complex({ mixed: true, content: x.sequence([]) }), {
                        default: 'x',
                    })
                )
            )
                .to.throw(XeneverUnsupportedError, /mixed content/v)
                .that.includes({ path: '/default' });
        });
    });
});
