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
        const extensible = x.element(
            'r',
            x.complex({
                content: x.sequence([
                    x.element('a', x.int()),
                    x.any({ minOccurs: 0, maxOccurs: 'unbounded' }),
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
                                },
                            ],
                        },
                        {
                            kind: 'element',
                            namespace: null,
                            localName: 'z',
                            attributes: [],
                            children: [],
                        },
                    ],
                },
            });
        });

        test('Is an array even for one occurrence, and absent when unmatched', () => {
            const one = x.element(
                'r',
                x.complex({ content: x.sequence([x.any({ minOccurs: 0 })]) })
            );
            expect(parse('<r><z/></r>', one).children['#any']).to.have.length(1);
            expect(parse('<r/>', one).children).to.deep.equal({});
        });

        test('Prefers a declared element that can match at that point', () => {
            const either = x.element(
                'r',
                x.complex({
                    content: x.choice([x.element('a', x.int()), x.any()], {
                        maxOccurs: 'unbounded',
                    }),
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
                    },
                ],
            });
        });

        test('Lets a wildcard match a declared name where the declaration can not', () => {
            const before = x.element(
                'r',
                x.complex({ content: x.sequence([x.any(), x.element('a', x.int())]) })
            );
            expect(parse('<r><a>not an int</a><a>1</a></r>', before).children).to.deep.equal({
                '#any': [
                    {
                        kind: 'element',
                        namespace: null,
                        localName: 'a',
                        attributes: [],
                        children: [{ kind: 'text', text: 'not an int' }],
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
                        x.any({ namespace: ['urn:a', null], minOccurs: 0, maxOccurs: 'unbounded' }),
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
                    content: x.sequence([x.any({ notNamespace: [null], minOccurs: 0 })]),
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
                x.complex({ content: x.sequence([x.any({ notNamespace: [] })]) })
            );
            expect(parse('<r><x/></r>', anyOther).children['#any']).to.have.length(1);
        });

        test('Names a missing wildcard element', () => {
            const required = x.element('r', x.complex({ content: x.sequence([x.any()]) }));
            expectInvalid(() => parse('<r/>', required), /`r` is missing any element/v, {
                path: '/r',
            });
        });

        test('Is allowed in an all group', () => {
            const all = x.element(
                'r',
                x.complex({ content: x.all([x.any(), x.element('a', x.int())]) })
            );
            expect(parse('<r><a>1</a><b/></r>', all).children['#any']).to.have.length(1);
        });

        test('Enters ordered children as #any', () => {
            const ordered = x.element(
                'r',
                x.complex({
                    ordered: true,
                    content: x.sequence([x.any(), x.element('a', x.int())]),
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
                attributes: [x.attribute('id', x.int()), x.anyAttribute({ notNamespace: [null] })],
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
            const anything = x.element('r', x.complex({ attributes: [x.anyAttribute()] }));
            expect(() => parse(`<r ${xsi} xsi:type="t"/>`, anything)).to.throw(
                XeneverUnsupportedError
            );
            expect(
                parse(`<r ${xsi} xsi:schemaLocation="a b"/>`, anything).attributes
            ).to.deep.equal({});
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
