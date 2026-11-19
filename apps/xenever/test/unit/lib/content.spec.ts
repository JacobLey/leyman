import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parse, x, XeneverUnsupportedError, XeneverValidationError } from 'xenever';

/**
 * Asserts parsing throws a validation error for the reason matched, at the location given.
 *
 * @param run - parses
 * @param reason - matches the message
 * @param location - where the error is
 */
const expectInvalid = (
    run: () => unknown,
    reason: RegExp,
    location: Record<string, number | string>
): void => {
    expect(run).to.throw(XeneverValidationError, reason).that.includes(location);
};

const xsi = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';

suite('Content', () => {
    suite('Ordered children', () => {
        const list = x.element(
            'list',
            x.complex({
                ordered: true,
                content: x.choice([x.element('a', x.int()), x.element('b', x.string())], {
                    minOccurs: 0,
                    maxOccurs: 'unbounded',
                }),
            })
        );

        test('Keeps the document order of different elements', () => {
            expect(parse('<list> <a>1</a> <b>x</b> <a>2</a> </list>', list)).to.deep.equal({
                attributes: {},
                children: [
                    { name: 'a', value: 1 },
                    { name: 'b', value: 'x' },
                    { name: 'a', value: 2 },
                ],
            });
        });

        test('Is an empty array without children', () => {
            expect(parse('<list/>', list)).to.deep.equal({ attributes: {}, children: [] });
        });

        test('Names entries by key', () => {
            const keyed = x.element(
                'r',
                x.complex({
                    ordered: true,
                    content: x.sequence([x.element('a', x.int(), { key: 'first' })]),
                })
            );
            expect(parse('<r><a>1</a></r>', keyed).children).to.deep.equal([
                { name: 'first', value: 1 },
            ]);
        });

        test('Still validates the content model and rejects text', () => {
            const sequence = x.element(
                'r',
                x.complex({
                    ordered: true,
                    content: x.sequence([x.element('a', x.int()), x.element('b', x.int())]),
                })
            );
            expectInvalid(() => parse('<r><b>1</b></r>', sequence), /`b` is not expected here/v, {
                path: '/r/b',
            });
            expectInvalid(
                () => parse('<r><a>1</a>t<b>1</b></r>', sequence),
                /Text is not allowed in `r`/v,
                { path: '/r' }
            );
        });
    });

    suite('Mixed content', () => {
        const paragraph = x.element(
            'p',
            x.complex({
                mixed: true,
                content: x.sequence([x.element('b', x.string())], {
                    minOccurs: 0,
                    maxOccurs: 'unbounded',
                }),
            })
        );

        test('Keeps text, whitespace included, between elements in document order', () => {
            expect(parse('<p>Hello <b>big</b> <b>world</b>!</p>', paragraph)).to.deep.equal({
                attributes: {},
                children: [
                    { name: '#text', value: 'Hello ' },
                    { name: 'b', value: 'big' },
                    { name: '#text', value: ' ' },
                    { name: 'b', value: 'world' },
                    { name: '#text', value: '!' },
                ],
            });
        });

        test('Merges text across comments, with CDATA as text', () => {
            expect(parse('<p>a<!-- c -->b<![CDATA[<c>]]></p>', paragraph).children).to.deep.equal([
                { name: '#text', value: 'ab<c>' },
            ]);
        });

        test('Still validates the content model', () => {
            expectInvalid(() => parse('<p>a<i/></p>', paragraph), /`i` is not expected here/v, {
                path: '/p/i',
            });
        });
    });

    suite('Element wildcards', () => {
        const xmlOnly = { xml: 'http://www.w3.org/XML/1998/namespace' };
        const withE = { ...xmlOnly, e: 'urn:e' };
        const extensible = x.element(
            'r',
            x.complex({
                content: x.sequence([
                    x.element('a', x.int()),
                    x.any({ processContents: 'skip', minOccurs: 0, maxOccurs: 'unbounded' }),
                ]),
            })
        );

        test('Keeps the elements a wildcard allows as nodes under #any', () => {
            expect(
                parse(
                    '<r xmlns:e="urn:e"><a>1</a><e:x e:k="v" k="w">t<!-- c --><y/></e:x><z/></r>',
                    extensible
                )
            ).to.deep.equal({
                attributes: {},
                children: {
                    a: 1,
                    '#any': [
                        {
                            kind: 'element',
                            namespace: 'urn:e',
                            localName: 'x',
                            attributes: [
                                { namespace: 'urn:e', localName: 'k', value: 'v' },
                                { namespace: null, localName: 'k', value: 'w' },
                            ],
                            children: [
                                { kind: 'text', text: 't' },
                                {
                                    kind: 'element',
                                    namespace: null,
                                    localName: 'y',
                                    attributes: [],
                                    children: [],
                                    inScopeNamespaces: withE,
                                },
                            ],
                            inScopeNamespaces: withE,
                        },
                        {
                            kind: 'element',
                            namespace: null,
                            localName: 'z',
                            attributes: [],
                            children: [],
                            inScopeNamespaces: withE,
                        },
                    ],
                },
            });
        });

        test('Keeps the namespaces in scope at each node, default namespace under an empty prefix', () => {
            const [node] = parse(
                '<r><a>1</a><x xmlns="urn:d" xmlns:p="urn:p"><y>p:t</y></x></r>',
                extensible
            ).children['#any']!;
            expect(node!.inScopeNamespaces).to.deep.equal({ ...xmlOnly, '': 'urn:d', p: 'urn:p' });
        });

        test('Shares one frozen record between nodes that declare no namespaces', () => {
            const [node] = parse('<r><a>1</a><x xmlns:p="urn:p"><y/></x></r>', extensible).children[
                '#any'
            ]!;
            const [child] = node!.children as x.XmlNode[];
            expect(child!.inScopeNamespaces).to.equal(node!.inScopeNamespaces);
            expect(Object.isFrozen(node!.inScopeNamespaces)).to.equal(true);
        });

        test('Is an array even for one occurrence, and absent when unmatched', () => {
            const one = x.element(
                'r',
                x.complex({
                    content: x.sequence([x.any({ processContents: 'skip', minOccurs: 0 })]),
                })
            );
            expect(parse('<r><z/></r>', one).children['#any']).to.have.length(1);
            expect(parse('<r/>', one).children).to.deep.equal({});
        });

        test('Prefers a declared element that can match at that point', () => {
            const either = x.element(
                'r',
                x.complex({
                    content: x.choice(
                        [x.element('a', x.int()), x.any({ processContents: 'skip' })],
                        {
                            maxOccurs: 'unbounded',
                        }
                    ),
                })
            );
            expect(parse('<r><a>1</a><b/></r>', either).children).to.deep.equal({
                a: [1],
                '#any': [
                    {
                        kind: 'element',
                        namespace: null,
                        localName: 'b',
                        attributes: [],
                        children: [],
                        inScopeNamespaces: xmlOnly,
                    },
                ],
            });
        });

        test('Lets a wildcard match a declared name where the declaration can not', () => {
            const before = x.element(
                'r',
                x.complex({
                    content: x.sequence([
                        x.any({ processContents: 'skip' }),
                        x.element('a', x.int()),
                    ]),
                })
            );
            expect(parse('<r><a>not an int</a><a>1</a></r>', before).children).to.deep.equal({
                '#any': [
                    {
                        kind: 'element',
                        namespace: null,
                        localName: 'a',
                        attributes: [],
                        children: [{ kind: 'text', text: 'not an int' }],
                        inScopeNamespaces: xmlOnly,
                    },
                ],
                a: 1,
            });
        });

        test('Allows only the listed namespaces', () => {
            const listed = x.element(
                'r',
                x.complex({
                    content: x.sequence([
                        x.any({
                            processContents: 'skip',
                            namespace: ['urn:a', null],
                            minOccurs: 0,
                            maxOccurs: 'unbounded',
                        }),
                    ]),
                })
            );
            expect(parse('<r><x xmlns="urn:a"/><y/></r>', listed).children['#any']).to.have.length(
                2
            );
            expectInvalid(
                () => parse('<r><x xmlns="urn:b"/></r>', listed),
                /not expected here; expected an element in `urn:a` or no namespace or the end of `r`/v,
                { path: '/r/x' }
            );
        });

        test('Allows any namespace but the listed ones', () => {
            const other = x.element(
                'r',
                x.complex({
                    content: x.sequence([
                        x.any({ processContents: 'skip', notNamespace: [null], minOccurs: 0 }),
                    ]),
                })
            );
            expect(parse('<r><x xmlns="urn:a"/></r>', other).children['#any']).to.have.length(1);
            expectInvalid(
                () => parse('<r><x/></r>', other),
                /expected an element not in no namespace or the end of `r`/v,
                { path: '/r/x' }
            );
        });

        test('Allows any namespace for an empty notNamespace', () => {
            const anyOther = x.element(
                'r',
                x.complex({
                    content: x.sequence([x.any({ processContents: 'skip', notNamespace: [] })]),
                })
            );
            expect(parse('<r><x/></r>', anyOther).children['#any']).to.have.length(1);
        });

        test('Names a missing wildcard element', () => {
            const required = x.element(
                'r',
                x.complex({ content: x.sequence([x.any({ processContents: 'skip' })]) })
            );
            expectInvalid(() => parse('<r/>', required), /`r` is missing any element/v, {
                path: '/r',
            });
        });

        test('Is allowed in an all group', () => {
            const all = x.element(
                'r',
                x.complex({
                    content: x.all([x.any({ processContents: 'skip' }), x.element('a', x.int())]),
                })
            );
            expect(parse('<r><a>1</a><b/></r>', all).children['#any']).to.have.length(1);
        });

        test('Enters ordered children as #any', () => {
            const ordered = x.element(
                'r',
                x.complex({
                    ordered: true,
                    content: x.sequence([
                        x.any({ processContents: 'skip' }),
                        x.element('a', x.int()),
                    ]),
                })
            );
            expect(parse('<r><b/><a>1</a></r>', ordered).children).to.deep.equal([
                {
                    name: '#any',
                    value: {
                        kind: 'element',
                        namespace: null,
                        localName: 'b',
                        attributes: [],
                        children: [],
                        inScopeNamespaces: xmlOnly,
                    },
                },
                { name: 'a', value: 1 },
            ]);
        });
    });

    suite('Attribute wildcards', () => {
        const open = x.element(
            'r',
            x.complex({
                attributes: [
                    x.attribute('id', x.int()),
                    x.anyAttribute({ processContents: 'skip', notNamespace: [null] }),
                ],
            })
        );

        test('Keeps undeclared attributes it allows under #any, after declared ones', () => {
            const value = parse('<r xmlns:e="urn:e" e:b="2" id="1" e:a=" x "/>', open);
            expect(value).to.deep.equal({
                attributes: {
                    id: 1,
                    '#any': [
                        { namespace: 'urn:e', localName: 'b', value: '2' },
                        { namespace: 'urn:e', localName: 'a', value: ' x ' },
                    ],
                },
            });
            expect(Object.keys(value.attributes)).to.deep.equal(['id', '#any']);
        });

        test('Leaves #any out when no attribute matched', () => {
            expect(parse('<r/>', open).attributes).to.deep.equal({});
        });

        test('Rejects an attribute it does not allow', () => {
            expectInvalid(() => parse('<r other="1"/>', open), /`other` is not declared on `r`/v, {
                path: '/r/@other',
            });
        });

        test('Never matches xsi attributes', () => {
            const anything = x.element(
                'r',
                x.complex({ attributes: [x.anyAttribute({ processContents: 'skip' })] })
            );
            expect(() => parse(`<r ${xsi} xsi:type="t"/>`, anything)).to.throw(
                XeneverValidationError,
                /^`xsi:type` names `t`, which is not a type `r` may have/v
            );
            expect(
                parse(`<r ${xsi} xsi:schemaLocation="a b"/>`, anything).attributes
            ).to.deep.equal({});
        });
    });

    suite('Wildcard processContents', () => {
        const note = x.element('note', x.int());
        const flag = x.attribute('flag', x.boolean(), { namespace: 'urn:f', fixed: 'true' });
        const wrap = <const P extends x.Particle>(wildcard: P) =>
            x.element('r', x.complex({ content: x.sequence([wildcard]) }));
        const withAttributes = <const A extends x.AnyAttribute>(wildcard: A) =>
            x.element('r', x.complex({ attributes: [wildcard] }));

        test('Is strict by default, so an element needs a declaration', () => {
            expectInvalid(
                () => parse('<r><other/></r>', wrap(x.any())),
                /`other` is not declared, which the strict wildcard matching it needs/v,
                { path: '/r/other' }
            );
        });

        test('Validates a strict match against its declaration, keeping it as a node', () => {
            const strict = wrap(x.any({ declarations: () => [note] }));
            expect(parse('<r><note> 1 </note></r>', strict).children['#any']).to.deep.equal([
                {
                    kind: 'element',
                    namespace: null,
                    localName: 'note',
                    attributes: [],
                    children: [{ kind: 'text', text: ' 1 ' }],
                    inScopeNamespaces: { xml: 'http://www.w3.org/XML/1998/namespace' },
                },
            ]);
            expectInvalid(() => parse('<r><note>x</note></r>', strict), /not a valid int/v, {
                path: '/r/note',
            });
        });

        test('Validates a lax match only when declared', () => {
            const lax = wrap(
                x.any({ processContents: 'lax', declarations: () => [note], maxOccurs: 2 })
            );
            expect(
                parse('<r><note>1</note><other>x</other></r>', lax).children['#any']
            ).to.have.length(2);
            expectInvalid(() => parse('<r><note>x</note></r>', lax), /not a valid int/v, {
                path: '/r/note',
            });
        });

        test('Validates nothing when skipped', () => {
            const skip = wrap(x.any({ processContents: 'skip', declarations: () => [note] }));
            expect(parse('<r><note>x</note></r>', skip).children['#any']).to.have.length(1);
        });

        test('Rejects xsi:type on an element validated without a declaration', () => {
            for (const processContents of ['lax', 'strict'] as const) {
                expect(() =>
                    parse(`<r ${xsi}><other xsi:type="t"/></r>`, wrap(x.any({ processContents })))
                ).to.throw(
                    XeneverUnsupportedError,
                    /^`xsi:type` on an element a wildcard matched that has no declaration is not supported/v
                );
            }
        });

        test('Takes the strongest of the wildcards that may match, and any of their declarations', () => {
            const either = wrap(
                x.choice([
                    x.any({ processContents: 'lax' }),
                    x.any({ processContents: 'skip' }),
                    x.any({ processContents: 'strict', declarations: () => [note] }),
                ])
            );
            expectInvalid(() => parse('<r><note>x</note></r>', either), /not a valid int/v, {
                path: '/r/note',
            });
            expectInvalid(() => parse('<r><other/></r>', either), /strict wildcard/v, {
                path: '/r/other',
            });
        });

        test('Is strict by default for attributes, so an attribute needs a declaration', () => {
            expectInvalid(
                () => parse('<r xmlns:f="urn:f" f:other="1"/>', withAttributes(x.anyAttribute())),
                /`f:other` is not declared, which the strict attribute wildcard of `r` needs/v,
                { path: '/r/@f:other' }
            );
        });

        test('Validates a strict attribute match against its declaration, keeping it as written', () => {
            const strict = withAttributes(x.anyAttribute({ declarations: () => [flag] }));
            expect(parse('<r xmlns:f="urn:f" f:flag="1"/>', strict).attributes).to.deep.equal({
                '#any': [{ namespace: 'urn:f', localName: 'flag', value: '1' }],
            });
            expectInvalid(
                () => parse('<r xmlns:f="urn:f" f:flag="yes"/>', strict),
                /not a valid boolean/v,
                {
                    path: '/r/@f:flag',
                }
            );
            expectInvalid(
                () => parse('<r xmlns:f="urn:f" f:flag="0"/>', strict),
                /must be "true"/v,
                {
                    path: '/r/@f:flag',
                }
            );
        });

        test('Validates a lax attribute match only when declared, and nothing when skipped', () => {
            const lax = withAttributes(
                x.anyAttribute({ processContents: 'lax', declarations: () => [flag] })
            );
            expect(parse('<r xmlns:f="urn:f" other="x"/>', lax).attributes['#any']).to.have.length(
                1
            );
            expectInvalid(
                () => parse('<r xmlns:f="urn:f" f:flag="yes"/>', lax),
                /not a valid boolean/v,
                {
                    path: '/r/@f:flag',
                }
            );
            const skip = withAttributes(
                x.anyAttribute({ processContents: 'skip', declarations: () => [flag] })
            );
            expect(
                parse('<r xmlns:f="urn:f" f:flag="yes"/>', skip).attributes['#any']
            ).to.have.length(1);
        });
    });

    suite('Nil', () => {
        const price = x.element(
            'price',
            x.complex({ attributes: [x.attribute('currency', x.token())], text: x.decimal() }),
            { nillable: true }
        );

        test('Reads xsi:nil="true" as null, dropping the attributes', () => {
            expect(parse(`<price ${xsi} currency="EUR" xsi:nil="true"/>`, price)).to.equal(null);
            expect(parse(`<price ${xsi} xsi:nil=" 1 "></price>`, price)).to.equal(null);
        });

        test('Reads xsi:nil="false" as usual', () => {
            expect(parse(`<price ${xsi} xsi:nil="0">1.0</price>`, price)).to.deep.equal({
                attributes: {},
                text: '1',
            });
        });

        test('Reads a nillable simple-typed element', () => {
            const count = x.element('n', x.int(), { nillable: true });
            expect(parse(`<n ${xsi} xsi:nil="true"/>`, count)).to.equal(null);
            expect(parse('<n>1</n>', count)).to.equal(1);
        });

        test('Still validates the attributes of a nil element', () => {
            expectInvalid(
                () => parse(`<price ${xsi} xsi:nil="true" other="1"/>`, price),
                /`other` is not declared/v,
                { path: '/price/@other' }
            );
        });

        test('Rejects a nil element that is not empty', () => {
            expectInvalid(
                () => parse(`<price ${xsi} xsi:nil="true"> </price>`, price),
                /`price` is `xsi:nil`, so must be empty/v,
                { path: '/price', column: 77 }
            );
            const nested = x.element(
                'r',
                x.complex({ content: x.sequence([x.element('a', x.int())]) }),
                { nillable: true }
            );
            expectInvalid(
                () => parse(`<r ${xsi} xsi:nil="true"><a>1</a></r>`, nested),
                /`r` is `xsi:nil`, so must be empty/v,
                { path: '/r/a' }
            );
        });

        test('Rejects an xsi:nil that is not a boolean', () => {
            expectInvalid(() => parse(`<price ${xsi} xsi:nil="yes"/>`, price), /boolean/v, {
                path: '/price/@xsi:nil',
            });
        });

        test('Rejects a nil element with a fixed value', () => {
            const fixed = x.element('n', x.int(), { nillable: true, fixed: '1' });
            expectInvalid(
                () => parse(`<n ${xsi} xsi:nil="true"/>`, fixed),
                /`n` has a fixed value, so must not be `xsi:nil`/v,
                { path: '/n/@xsi:nil' }
            );
        });

        test('Reads a nil child as null', () => {
            const parent = x.element(
                'r',
                x.complex({
                    content: x.sequence([x.element('a', x.int(), { nillable: true })]),
                })
            );
            expect(parse(`<r ${xsi}><a xsi:nil="true"/></r>`, parent).children).to.deep.equal({
                a: null,
            });
        });
    });

    suite('Default and fixed values', () => {
        test('Reads an absent attribute as its default or fixed value', () => {
            const declaration = x.element(
                'r',
                x.complex({
                    attributes: [
                        x.attribute('a', x.int(), { default: '01' }),
                        x.attribute('b', x.list(x.int()), { fixed: '1 2' }),
                        x.attribute('c', x.int()),
                    ],
                })
            );
            const read = parse('<r/>', declaration);
            expect(read).to.deep.equal({ attributes: { a: 1, b: [1, 2] } });
            expect(parse('<r a="5" c="3"/>', declaration).attributes).to.deep.equal({
                a: 5,
                b: [1, 2],
                c: 3,
            });
            // Each read gets its own value.
            expect(parse('<r/>', declaration).attributes.b).not.to.equal(read.attributes.b);
        });

        test('Compares a present fixed attribute as a value', () => {
            const declaration = x.element(
                'r',
                x.complex({ attributes: [x.attribute('v', x.double(), { fixed: 'NaN' })] })
            );
            expect(Number.isNaN(parse('<r v=" NaN "/>', declaration).attributes.v)).to.equal(true);
            expectInvalid(() => parse('<r v="1"/>', declaration), /`v` must be "NaN"/v, {
                path: '/r/@v',
            });
            const listed = x.element(
                'r',
                x.complex({ attributes: [x.attribute('v', x.list(x.int()), { fixed: '1 2' })] })
            );
            expect(parse('<r v="01 2"/>', listed).attributes.v).to.deep.equal([1, 2]);
            expectInvalid(() => parse('<r v="1 3"/>', listed), /must be "1 2"/v, {
                path: '/r/@v',
            });
            expectInvalid(() => parse('<r v="1"/>', listed), /must be "1 2"/v, { path: '/r/@v' });
        });

        test('Compares a fixed date as a value, and keeps it as written', () => {
            const declaration = x.element(
                'r',
                x.complex({ attributes: [x.attribute('v', x.date(), { fixed: '2026-11-12Z' })] })
            );
            expect(parse('<r v="2026-11-12+00:00"/>', declaration).attributes.v).to.equal(
                '2026-11-12+00:00'
            );
            expectInvalid(
                () => parse('<r v="2026-11-12"/>', declaration),
                /must be "2026-11-12Z"/v,
                {
                    path: '/r/@v',
                }
            );
            const day = x.element('d', x.list(x.gDay()), { fixed: '---01Z' });
            expect(parse('<d>---01+00:00</d>', day)).to.deep.equal(['---01+00:00']);
        });

        test('Compares a fixed union value as its member reads it', () => {
            const either = x.element('e', x.union([x.list(x.int()), x.token()]), {
                fixed: '1 2',
            });
            expect(parse('<e>01 2</e>', either)).to.deep.equal([1, 2]);
            expectInvalid(() => parse('<e>1</e>', either), /must be "1 2"/v, { path: '/e' });
        });

        test('Reads an empty element as its default', () => {
            const count = x.element('n', x.int(), { default: '7' });
            expect(parse('<n/>', count)).to.equal(7);
            expect(parse('<n></n>', count)).to.equal(7);
            expect(parse('<n>2</n>', count)).to.equal(2);
            expectInvalid(() => parse('<n> </n>', count), /int/v, { path: '/n' });
        });

        test('Reads the default of an element with text', () => {
            const price = x.element(
                'price',
                x.complex({ attributes: [x.attribute('c', x.token())], text: x.decimal() }),
                { default: '0' }
            );
            expect(parse('<price c="EUR"/>', price)).to.deep.equal({
                attributes: { c: 'EUR' },
                text: '0',
            });
        });

        test('Reads an empty element as its fixed value, and compares a present one', () => {
            const version = x.element('v', x.decimal(), { fixed: '1.0' });
            expect(parse('<v/>', version)).to.equal('1');
            expect(parse('<v>1.00</v>', version)).to.equal('1');
            expectInvalid(() => parse('<v>2</v>', version), /`v` must be "1.0"/v, { path: '/v' });
        });
    });
});
