import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import {
    parse,
    x,
    XeneverUnsupportedError,
    XeneverValidationError,
    XeneverXmlError,
} from 'xenever';

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

const item = x.element(
    'item',
    x.complex({
        attributes: [
            x.attribute('sku', x.token(), { use: 'required' }),
            x.attribute('qty', x.int()),
        ],
        content: x.sequence([
            x.element('price', x.decimal()),
            x.element('note', x.string(), { minOccurs: 0 }),
        ]),
    }),
    { maxOccurs: 'unbounded' }
);
const order = x.element(
    'order',
    x.complex({ content: x.sequence([x.element('id', x.token()), item]) })
);

suite('parse', () => {
    suite('Values', () => {
        test('Reads a simple-typed root as its value', () => {
            expect(parse('<price> 01.50 </price>', x.element('price', x.decimal()))).to.equal(
                '1.5'
            );
        });

        test('Reads attributes and children in declaration order', () => {
            const value = parse(
                '<order><id>A1</id><item qty="2" sku="x"><price>3</price><note>n</note></item></order>',
                order
            );
            expect(value).to.deep.equal({
                attributes: {},
                children: {
                    id: 'A1',
                    item: [
                        { attributes: { sku: 'x', qty: 2 }, children: { price: '3', note: 'n' } },
                    ],
                },
            });
            expect(Object.keys(value.children.item[0]!.attributes)).to.deep.equal(['sku', 'qty']);
        });

        test('Leaves out absent optional attributes and children', () => {
            expect(
                parse('<order><id>A1</id><item sku="x"><price>3</price></item></order>', order)
            ).to.deep.equal({
                attributes: {},
                children: {
                    id: 'A1',
                    item: [{ attributes: { sku: 'x' }, children: { price: '3' } }],
                },
            });
        });

        test('Ignores whitespace between elements, comments and processing instructions', () => {
            expect(
                parse(
                    '<order>\n  <id>A1</id><!-- c -->\n  <?pi x?><item sku="x"><price>3</price></item>\n</order>',
                    order
                ).children.id
            ).to.equal('A1');
        });

        test('Reads text content with attributes', () => {
            const amount = x.element(
                'amount',
                x.complex({ attributes: [x.attribute('currency', x.token())], text: x.decimal() })
            );
            expect(parse('<amount currency="EUR">2.50<!-- c --></amount>', amount)).to.deep.equal({
                attributes: { currency: 'EUR' },
                text: '2.5',
            });
        });

        test('Reads an empty complex type', () => {
            expect(parse('<empty/>', x.element('empty', x.complex()))).to.deep.equal({
                attributes: {},
            });
        });

        test('Groups a repeated element into an array', () => {
            const list = x.element(
                'list',
                x.complex({
                    content: x.sequence([x.element('n', x.int(), { minOccurs: 0, maxOccurs: 3 })]),
                })
            );
            expect(parse('<list><n>1</n><n>2</n></list>', list).children).to.deep.equal({
                n: [1, 2],
            });
            expect(parse('<list><n>1</n></list>', list).children).to.deep.equal({ n: [1] });
            expect(parse('<list/>', list).children).to.deep.equal({});
        });

        test('Merges an element declared twice into one array', () => {
            const pair = x.element(
                'pair',
                x.complex({
                    content: x.sequence([
                        x.element('a', x.int()),
                        x.element('b', x.int()),
                        x.element('a', x.int()),
                    ]),
                })
            );
            expect(parse('<pair><a>1</a><b>2</b><a>3</a></pair>', pair).children).to.deep.equal({
                a: [1, 3],
                b: 2,
            });
        });

        test('Reads one branch of a choice', () => {
            const shape = x.element(
                'shape',
                x.complex({
                    content: x.choice([
                        x.element('circle', x.double()),
                        x.sequence([
                            x.element('width', x.double()),
                            x.element('height', x.double()),
                        ]),
                    ]),
                })
            );
            expect(parse('<shape><circle>1</circle></shape>', shape).children).to.deep.equal({
                circle: 1,
            });
            expect(
                parse('<shape><width>1</width><height>2</height></shape>', shape).children
            ).to.deep.equal({
                width: 1,
                height: 2,
            });
        });

        test('Reads a choice in a choice', () => {
            const pick = x.element(
                'pick',
                x.complex({
                    content: x.choice([
                        x.choice([x.element('a', x.int()), x.element('b', x.int())]),
                        x.element('c', x.int()),
                    ]),
                })
            );
            expect(parse('<pick><b>1</b></pick>', pick).children).to.deep.equal({ b: 1 });
        });

        test('Reads an element in two branches of a choice as one value', () => {
            const pick = x.element(
                'pick',
                x.complex({
                    content: x.choice([
                        x.sequence([x.element('a', x.int()), x.element('b', x.int())]),
                        x.sequence([x.element('a', x.int()), x.element('c', x.int())]),
                    ]),
                })
            );
            expect(parse('<pick><a>1</a><c>2</c></pick>', pick).children).to.deep.equal({
                a: 1,
                c: 2,
            });
        });

        test('Reads an element in a repeated group as an array', () => {
            const pairs = x.element(
                'pairs',
                x.complex({
                    content: x.sequence([x.element('a', x.int()), x.element('b', x.int())], {
                        maxOccurs: 2,
                    }),
                })
            );
            expect(parse('<pairs><a>1</a><b>2</b></pairs>', pairs).children).to.deep.equal({
                a: [1],
                b: [2],
            });
        });

        test('Reads many children of nested repeated groups in time linear in the children', () => {
            // Each `a` may end one occurrence of either group and start another, so without merging the
            // branches that differ only in their counters the model would grow with every child.
            const nested = x.element(
                'nested',
                x.complex({
                    content: x.choice(
                        [
                            x.sequence([x.element('a', x.int(), { maxOccurs: 'unbounded' })], {
                                maxOccurs: 100_000_000,
                            }),
                            x.element('b', x.int()),
                        ],
                        { maxOccurs: 100_000 }
                    ),
                })
            );
            const children = '<a>1</a>'.repeat(5000);
            expect(
                parse(`<nested>${children}<b>2</b>${children}</nested>`, nested).children
            ).to.deep.equal({
                a: Array.from({ length: 10_000 }, () => 1),
                b: [2],
            });
        });

        test('Reads an element that a choice allows once or in a counted group', () => {
            const either = x.element(
                'either',
                x.complex({
                    content: x.choice([
                        x.element('a', x.int()),
                        x.sequence([x.element('a', x.int())], { minOccurs: 2, maxOccurs: 3 }),
                        x.sequence([x.element('a', x.int()), x.element('b', x.int())]),
                        x.sequence([
                            x.element('a', x.int()),
                            x.element('b', x.int(), { maxOccurs: 2 }),
                        ]),
                    ]),
                })
            );
            expect(parse('<either><a>1</a></either>', either).children).to.deep.equal({ a: [1] });
            expect(parse('<either><a>1</a><a>2</a></either>', either).children).to.deep.equal({
                a: [1, 2],
            });
            expect(
                parse('<either><a>1</a><b>2</b><b>3</b></either>', either).children
            ).to.deep.equal({
                a: [1],
                b: [2, 3],
            });
        });

        test('Skips an optional first element', () => {
            const pair = x.element(
                'pair',
                x.complex({
                    content: x.sequence([
                        x.element('a', x.int(), { minOccurs: 0 }),
                        x.element('b', x.int()),
                    ]),
                })
            );
            expect(parse('<pair><b>2</b></pair>', pair).children).to.deep.equal({ b: 2 });
        });

        test('Reads an optional empty choice', () => {
            const none = x.element('none', x.complex({ content: x.choice([], { minOccurs: 0 }) }));
            expect(parse('<none/>', none).children).to.deep.equal({});
        });

        test('Reads a complex type shared by two elements', () => {
            const shared = x.complex({ attributes: [x.attribute('id', x.int())] });
            const pair = x.element(
                'pair',
                x.complex({ content: x.sequence([x.element('a', shared), x.element('b', shared)]) })
            );
            expect(parse('<pair><a id="1"/><b/></pair>', pair).children).to.deep.equal({
                a: { attributes: { id: 1 } },
                b: { attributes: {} },
            });
        });

        test('Reads an all group in any order', () => {
            const project = x.element(
                'project',
                x.complex({
                    content: x.all([
                        x.element('name', x.token()),
                        x.element('url', x.anyUri(), { minOccurs: 0 }),
                    ]),
                })
            );
            expect(
                parse('<project><url>u</url><name>n</name></project>', project).children
            ).to.deep.equal({
                name: 'n',
                url: 'u',
            });
        });

        test('Reads an optional all group', () => {
            const project = x.element(
                'project',
                x.complex({ content: x.all([x.element('name', x.token())], { minOccurs: 0 }) })
            );
            expect(parse('<project/>', project).children).to.deep.equal({});
        });

        test('Reads recursion through a lazy reference', () => {
            interface Tree {
                attributes: x.NoProperties;
                children: { tree?: Tree[] };
            }
            const tree = x.element(
                'tree',
                x.complex({
                    content: x.sequence([
                        x.lazy((): x.ElementOf<'tree', Tree> => tree, {
                            minOccurs: 0,
                            maxOccurs: 'unbounded',
                        }),
                    ]),
                })
            );
            expect(parse('<tree><tree><tree/></tree><tree/></tree>', tree)).to.deep.equal({
                attributes: {},
                children: {
                    tree: [
                        { attributes: {}, children: { tree: [{ attributes: {}, children: {} }] } },
                        { attributes: {}, children: {} },
                    ],
                },
            });
        });

        test('Reads recursion through a type shared by two elements', () => {
            interface Branch {
                attributes: x.NoProperties;
                children: { branch?: Branch[] };
            }
            const branch = x.element(
                'branch',
                x.complex({
                    content: x.sequence([
                        x.lazy((): x.ElementOf<'branch', Branch> => branch, {
                            minOccurs: 0,
                            maxOccurs: 'unbounded',
                        }),
                    ]),
                })
            );
            const trunk = x.element('trunk', branch.type);
            expect(parse('<trunk><branch><branch/></branch></trunk>', trunk)).to.deep.equal({
                attributes: {},
                children: {
                    branch: [
                        {
                            attributes: {},
                            children: { branch: [{ attributes: {}, children: {} }] },
                        },
                    ],
                },
            });
        });

        test('Reads recursion through a getter that builds a new declaration each call', () => {
            interface Node {
                attributes: x.NoProperties;
                children: { node?: Node[] };
            }
            const node = x.complex({
                content: x.sequence([
                    x.lazy((): x.ElementOf<'node', Node> => x.element('node', node), {
                        minOccurs: 0,
                        maxOccurs: 'unbounded',
                    }),
                ]),
            });
            expect(parse('<node><node/></node>', x.element('node', node))).to.deep.equal({
                attributes: {},
                children: { node: [{ attributes: {}, children: {} }] },
            });
        });

        test('Accepts an as const literal', () => {
            const literal = {
                kind: 'element',
                name: 'n',
                type: { kind: 'int' },
            } as const satisfies x.Element;
            expect(parse('<n>4</n>', literal)).to.equal(4);
        });

        test('Ignores the minOccurs and maxOccurs of the root', () => {
            expect(
                parse('<n>4</n>', x.element('n', x.int(), { minOccurs: 0, maxOccurs: 5 }))
            ).to.equal(4);
        });
    });

    suite('Namespaces', () => {
        const ns = 'urn:example';
        const book = x.element(
            'book',
            x.complex({
                attributes: [
                    x.attribute('id', x.token()),
                    x.attribute('id', x.token(), { namespace: ns, key: 'nsId' }),
                ],
                content: x.sequence([
                    x.element('title', x.string(), { namespace: ns }),
                    x.element('title', x.string(), { key: 'plainTitle' }),
                ]),
            }),
            { namespace: ns }
        );

        test('Matches names by namespace, whatever the prefix', () => {
            const expected = {
                attributes: { id: '1', nsId: '2' },
                children: { title: 'a', plainTitle: 'b' },
            };
            expect(
                parse(
                    `<book xmlns="${ns}" id="1" xmlns:e="${ns}" e:id="2"><title>a</title><title xmlns="">b</title></book>`,
                    book
                )
            ).to.deep.equal(expected);
            expect(
                parse(
                    `<p:book xmlns:p="${ns}" id="1" p:id="2"><p:title>a</p:title><title>b</title></p:book>`,
                    book
                )
            ).to.deep.equal(expected);
        });

        test('Rejects a root in the wrong namespace', () => {
            expectInvalid(
                () => parse('<book/>', book),
                /Expected the root element `book` in `urn:example`, not `book`/v,
                {
                    path: '/book',
                    line: 1,
                    column: 1,
                }
            );
        });

        test('Resolves QName values against the namespaces in scope', () => {
            const ref = x.element(
                'ref',
                x.complex({ attributes: [x.attribute('to', x.qname())], text: x.qname() }),
                { namespace: ns }
            );
            expect(parse(`<ref xmlns="${ns}" xmlns:p="urn:p" to="p:a">b</ref>`, ref)).to.deep.equal(
                {
                    attributes: { to: { namespace: 'urn:p', localName: 'a' } },
                    text: { namespace: ns, localName: 'b' },
                }
            );
        });
    });

    suite('Document errors', () => {
        test('Rejects a root with another name', () => {
            expectInvalid(
                () => parse('<other/>', order),
                /Expected the root element `order`, not `other`/v,
                {
                    path: '/other',
                }
            );
        });

        test('Rejects XML that is not well-formed', () => {
            expect(() => parse('<order>', order)).to.throw(XeneverXmlError);
        });

        test('Rejects an undeclared attribute', () => {
            expectInvalid(
                () =>
                    parse(
                        '<order a="1"><id>A</id><item sku="x"><price>1</price></item></order>',
                        order
                    ),
                /Attribute `a` is not declared on `order`/v,
                { path: '/order/@a', line: 1, column: 8, offset: 7 }
            );
        });

        test('Rejects an attribute on a simple-typed element', () => {
            expectInvalid(
                () => parse('<n a="1">1</n>', x.element('n', x.int())),
                /Attribute `a` is not declared/v,
                {
                    path: '/n/@a',
                }
            );
        });

        test('Rejects a missing required attribute', () => {
            expectInvalid(
                () => parse('<order><id>A</id><item><price>1</price></item></order>', order),
                /Element `item` is missing attribute `sku`/v,
                { path: '/order/item', column: 18 }
            );
        });

        test('Rejects a missing required attribute that has a fixed value', () => {
            const fixed = x.element(
                'n',
                x.complex({
                    attributes: [x.attribute('a', x.int(), { use: 'required', fixed: '1' })],
                })
            );
            expectInvalid(() => parse('<n/>', fixed), /Element `n` is missing attribute `a`/v, {
                path: '/n',
            });
            expect(parse('<n a="1"/>', fixed)).to.deep.equal({ attributes: { a: 1 } });
        });

        test('Rejects an invalid attribute value', () => {
            expectInvalid(
                () =>
                    parse(
                        '<order><id>A</id><item sku="x" qty="many"><price>1</price></item></order>',
                        order
                    ),
                /"many" is not a valid int/v,
                { path: '/order/item/@qty' }
            );
        });

        test('Rejects an invalid element value', () => {
            expectInvalid(
                () =>
                    parse(
                        '<order><id>A</id><item sku="x"><price>one</price></item></order>',
                        order
                    ),
                /"one" is not a valid decimal/v,
                { path: '/order/item/price' }
            );
        });

        test('Rejects an unexpected element, naming what was expected', () => {
            expectInvalid(
                () =>
                    parse(
                        '<order><id>A</id><item sku="x"><price>1</price></item><other/></order>',
                        order
                    ),
                /Element `other` is not expected here; expected `item` or the end of `order`/v,
                { path: '/order/other' }
            );
        });

        test('Rejects an element out of order', () => {
            expectInvalid(
                () => parse('<order><item sku="x"><price>1</price></item></order>', order),
                /Element `item` is not expected here; expected `id` \(/v,
                { path: '/order/item' }
            );
        });

        test('Rejects a child of a type with no expected children left', () => {
            const one = x.element(
                'one',
                x.complex({ content: x.sequence([x.element('a', x.int())]) })
            );
            expectInvalid(
                () => parse('<one><a>1</a><a>2</a></one>', one),
                /not expected here; expected the end of `one`/v,
                {
                    path: '/one/a[2]',
                }
            );
        });

        test('Rejects a child where nothing can follow', () => {
            const none = x.element('none', x.complex({ content: x.choice([]) }));
            expectInvalid(
                () => parse('<none><a/></none>', none),
                /Element `a` is not expected here \(/v,
                {
                    path: '/none/a',
                }
            );
        });

        test('Rejects an element no branch of a choice expects', () => {
            const pick = x.element(
                'pick',
                x.complex({ content: x.choice([x.element('a', x.int()), x.element('b', x.int())]) })
            );
            expectInvalid(
                () => parse('<pick><c/></pick>', pick),
                /Element `c` is not expected here; expected `a` or `b` \(/v,
                {
                    path: '/pick/c',
                }
            );
        });

        test('Rejects more elements than maxOccurs', () => {
            const list = x.element(
                'list',
                x.complex({ content: x.sequence([x.element('n', x.int(), { maxOccurs: 2 })]) })
            );
            expectInvalid(
                () => parse('<list><n>1</n><n>2</n><n>3</n></list>', list),
                /not expected here/v,
                {
                    path: '/list/n[3]',
                }
            );
        });

        test('Rejects a missing element', () => {
            expectInvalid(
                () => parse('<order><id>A</id></order>', order),
                /Element `order` is missing `item`/v,
                {
                    path: '/order',
                }
            );
        });

        test('Rejects a repeated element of an all group', () => {
            const project = x.element(
                'project',
                x.complex({ content: x.all([x.element('name', x.token())]) })
            );
            expectInvalid(
                () => parse('<project><name>a</name><name>b</name></project>', project),
                /Element `name` is not expected here; expected the end of `project`/v,
                { path: '/project/name[2]' }
            );
        });

        test('Rejects a missing element of an all group', () => {
            const project = x.element(
                'project',
                x.complex({
                    content: x.all([x.element('name', x.token()), x.element('url', x.token())]),
                })
            );
            expectInvalid(
                () => parse('<project><url>u</url></project>', project),
                /`project` is missing `name`/v,
                {
                    path: '/project',
                }
            );
        });

        test('Rejects text in element-only content', () => {
            expectInvalid(
                () => parse('<order>\n  text<id>A</id></order>', order),
                /Text is not allowed in `order`, which has element-only content/v,
                { path: '/order', line: 1, column: 8 }
            );
        });

        test('Rejects a child element of a simple-typed element', () => {
            expectInvalid(
                () => parse('<n><m/></n>', x.element('n', x.string())),
                /Element `m` is not allowed/v,
                {
                    path: '/n/m',
                }
            );
        });

        test('Rejects whitespace in an empty complex type', () => {
            expectInvalid(
                () => parse('<empty> </empty>', x.element('empty', x.complex())),
                /`empty` must be empty/v,
                {
                    path: '/empty',
                    column: 8,
                }
            );
        });

        test('Rejects a child element in an empty complex type', () => {
            expectInvalid(
                () => parse('<empty><a/></empty>', x.element('empty', x.complex())),
                /must be empty/v,
                {
                    path: '/empty/a',
                }
            );
        });

        test('Rejects an undeclared QName prefix', () => {
            expectInvalid(
                () => parse('<q>p:a</q>', x.element('q', x.qname())),
                /The prefix of QName "p:a" is not declared/v,
                {
                    path: '/q',
                }
            );
        });
    });

    suite('xsi attributes', () => {
        const xsi = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';

        test('Allows schema location hints anywhere', () => {
            expect(
                parse(
                    `<n ${xsi} xsi:schemaLocation="urn:a a.xsd" xsi:noNamespaceSchemaLocation="n.xsd">1</n>`,
                    x.element('n', x.int())
                )
            ).to.equal(1);
        });

        test('Rejects xsi:nil on an element that is not nillable', () => {
            expectInvalid(
                () => parse(`<n ${xsi} xsi:nil="false">1</n>`, x.element('n', x.int())),
                /not nillable/v,
                {
                    path: '/n/@xsi:nil',
                }
            );
        });

        test('Rejects xsi:type as unsupported', () => {
            expect(() => parse(`<n ${xsi} xsi:type="x">1</n>`, x.element('n', x.int())))
                .to.throw(XeneverUnsupportedError, /`xsi:type` is not supported \(line 1, column/v)
                .that.includes({ path: '/n/@xsi:type' });
        });

        test('Rejects xsi:type before anything it would make valid', () => {
            for (const document of [
                `<n other="1" ${xsi} xsi:type="x">1</n>`,
                `<n ${xsi} xsi:nil="true" xsi:type="x"/>`,
                `<n ${xsi} xsi:type="x">not an int</n>`,
            ]) {
                expect(() => parse(document, x.element('n', x.int())))
                    .to.throw(XeneverUnsupportedError, /`xsi:type` is not supported/v)
                    .that.includes({ path: '/n/@xsi:type' });
            }
        });

        test('Rejects other xsi attributes as undeclared', () => {
            expectInvalid(
                () => parse(`<n ${xsi} xsi:other="x">1</n>`, x.element('n', x.int())),
                /not declared/v,
                {
                    path: '/n/@xsi:other',
                }
            );
        });
    });

    suite('Standard Schema', () => {
        const n = x.element('n', x.int());

        test('Returns the value', () => {
            expect(n['~standard'].validate('<n>1</n>')).to.deep.equal({ value: 1 });
            expect(n['~standard']).to.include({ version: 1, vendor: 'xenever' });
        });

        test('Returns a document error as an issue with the path as steps', () => {
            const result = order['~standard'].validate(
                '<order><id>A</id><item sku="x"><price>?</price></item></order>'
            );
            expect(result).to.deep.equal({
                issues: [
                    {
                        message:
                            '"?" is not a valid decimal (at /order/item/price, line 1, column 32)',
                        path: ['order', 'item', 'price'],
                    },
                ],
            });
        });

        test('Returns an error about the whole document without a path', () => {
            expect(n['~standard'].validate('<n>')).to.have.nested.property(
                'issues[0].path',
                undefined
            );
        });

        test('Returns xsi:type as an issue', () => {
            expect(
                n['~standard'].validate(
                    '<n xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="x"/>'
                )
            ).to.have.nested.property('issues[0].path[1]', '@xsi:type');
        });

        test('Returns an issue for a value that is not a string', () => {
            expect(n['~standard'].validate(1)).to.deep.equal({
                issues: [{ message: 'Expected an XML string' }],
            });
        });

        test('Is not enumerable, so the declaration stays plain data', () => {
            expect(Object.keys(n)).to.deep.equal(['kind', 'name', 'type']);
            expect(JSON.stringify(n)).to.equal(
                '{"kind":"element","name":"n","type":{"kind":"int"}}'
            );
        });
    });
});
