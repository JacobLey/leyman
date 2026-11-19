import type { XmlElementNode, XmlTextNode } from '#internal/lib/xml/nodes.js';
import { XmlError } from '@rgrove/parse-xml';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { XeneverXmlError } from 'xenever';
import { maxElementDepth, readXml } from '#internal/lib/xml/read-xml.js';

const xmlNamespace = 'http://www.w3.org/XML/1998/namespace';
const xmlnsNamespace = 'http://www.w3.org/2000/xmlns/';

/**
 * Asserts reading `xml` throws an `XeneverXmlError` for the reason matched, at the location given.
 *
 * @param xml - document to read
 * @param reason - matches the error message
 * @param location - where the error is
 * @param location.line - 1-based line
 * @param location.column - 1-based column
 * @param location.offset - 0-based offset
 * @param location.path - path to the element or attribute
 */
const expectXmlError = (
    xml: string,
    reason: RegExp,
    location: { line: number; column: number; offset: number; path: string }
): void => {
    expect(() => readXml(xml))
        .to.throw(XeneverXmlError, reason)
        .that.includes(location);
};

type Stripped = Omit<
    XmlElementNode,
    'attributes' | 'children' | 'inScopeNamespaces' | 'path' | 'prefix'
> & {
    attributes: Omit<XmlElementNode['attributes'][number], 'path' | 'prefix'>[];
    children: (Stripped | XmlTextNode)[];
};

/**
 * Drops what depends on the prefixes chosen.
 *
 * @param element - element read
 * @returns the element without prefixes, paths (which are written with prefixes) or in-scope namespaces
 */
const withoutPrefixes = (element: XmlElementNode): Stripped => {
    const { prefix, inScopeNamespaces, path, attributes, children, ...rest } = element;
    return {
        ...rest,
        attributes: attributes.map(({ prefix: _prefix, path: _path, ...attribute }) => attribute),
        children: children.map(child => (child.kind === 'text' ? child : withoutPrefixes(child))),
    };
};

/**
 * The `index`th child, as an element.
 *
 * @param element - whose child to take
 * @param index - position among its children
 * @returns the element at that position
 */
const childElement = (element: XmlElementNode, index: number): XmlElementNode =>
    element.children[index] as XmlElementNode;

suite('readXml', () => {
    suite('Tree', () => {
        test('Reads an element in no namespace', () => {
            expect(readXml('<order id="7">text</order>')).to.deep.equal({
                kind: 'element',
                namespace: null,
                localName: 'order',
                prefix: null,
                attributes: [
                    {
                        namespace: null,
                        localName: 'id',
                        prefix: null,
                        value: '7',
                        location: { line: 1, column: 8, offset: 7 },
                        path: '/order/@id',
                    },
                ],
                children: [
                    { kind: 'text', text: 'text', location: { line: 1, column: 15, offset: 14 } },
                ],
                location: { line: 1, column: 1, offset: 0 },
                path: '/order',
                inScopeNamespaces: new Map([['xml', xmlNamespace]]),
            });
        });

        test('Skips the XML declaration, comments and processing instructions around the root', () => {
            const root = readXml('<?xml version="1.0"?>\n<!-- c --><?pi x?>\n<order/>\n<?pi?>');
            expect(root).to.include({ localName: 'order', path: '/order' });
            expect(root.location).to.deep.equal({ line: 3, column: 1, offset: 41 });
        });

        test('Drops comments and processing instructions, merging the text around them', () => {
            const root = readXml('<a>one<!-- c --> two<?pi x?> <![CDATA[<three>]]>&amp;&#x34;</a>');
            expect(root.children).to.deep.equal([
                {
                    kind: 'text',
                    text: 'one two <three>&4',
                    location: { line: 1, column: 4, offset: 3 },
                },
            ]);
        });

        test('Locates CDATA text by its start', () => {
            const root = readXml('<a><b/><![CDATA[x]]></a>');
            expect(root.children.at(1)).to.deep.equal({
                kind: 'text',
                text: 'x',
                location: { line: 1, column: 8, offset: 7 },
            });
        });

        test('Keeps text and elements in document order', () => {
            const root = readXml('<a> x <b/> y </a>');
            expect(root.children.map(child => child.kind)).to.deep.equal([
                'text',
                'element',
                'text',
            ]);
        });

        test('Numbers only element names repeated among siblings', () => {
            const root = readXml('<order><item/><note/><item><sku/></item></order>');
            expect(root.children.map(child => (child as XmlElementNode).path)).to.deep.equal([
                '/order/item[1]',
                '/order/note',
                '/order/item[2]',
            ]);
            expect(childElement(childElement(root, 2), 0).path).to.equal('/order/item[2]/sku');
        });

        test('Writes paths with prefixes', () => {
            const root = readXml('<p:a xmlns:p="urn:p"><p:b p:c="1"/></p:a>');
            expect(childElement(root, 0).attributes[0]!.path).to.equal('/p:a/p:b/@p:c');
        });
    });

    suite('Namespaces', () => {
        test('The default namespace applies to elements, not attributes', () => {
            const root = readXml('<a xmlns="urn:a" x="1"><b/></a>');
            expect(root.namespace).to.equal('urn:a');
            expect(root.attributes[0]!.namespace).to.equal(null);
            expect(childElement(root, 0).namespace).to.equal('urn:a');
        });

        test('Namespace declarations are not attributes', () => {
            expect(readXml('<a xmlns="urn:a" xmlns:p="urn:p"/>').attributes).to.deep.equal([]);
        });

        test('A prefixed name takes its prefix namespace', () => {
            const root = readXml('<p:a xmlns:p="urn:p" p:x="1"/>');
            expect(root).to.include({ namespace: 'urn:p', localName: 'a', prefix: 'p' });
            expect(root.attributes[0]).to.include({
                namespace: 'urn:p',
                localName: 'x',
                prefix: 'p',
            });
        });

        test('The same document with other prefixes reads the same apart from prefixes', () => {
            const one = readXml(
                '<o:order xmlns:o="urn:order" xmlns:s="urn:sku"><o:item s:sku="1">x</o:item></o:order>'
            );
            const two = readXml(
                '<p:order xmlns:p="urn:order" xmlns:t="urn:sku"><p:item t:sku="1">x</p:item></p:order>'
            );
            expect(withoutPrefixes(one)).to.deep.equal(withoutPrefixes(two));
        });

        test('Resolves namespaces, whatever the prefixes', () => {
            const resolved = (element: XmlElementNode): unknown => ({
                name: [element.namespace, element.localName],
                attributes: element.attributes.map(({ namespace, localName, value }) => [
                    namespace,
                    localName,
                    value,
                ]),
                children: element.children.map(child =>
                    child.kind === 'text' ? child.text : resolved(child)
                ),
            });
            expect(
                resolved(readXml('<o:a xmlns:o="urn:o" xmlns:s="urn:s"><o:b s:c="1">x</o:b></o:a>'))
            ).to.deep.equal(
                resolved(readXml('<a xmlns="urn:o"><b xmlns:t="urn:s" t:c="1">x</b></a>'))
            );
        });

        test('The xml prefix is always declared', () => {
            const root = readXml('<a xml:lang="en"/>');
            expect(root.attributes[0]).to.include({ namespace: xmlNamespace, localName: 'lang' });
        });

        test('The xml prefix may be declared to its own namespace', () => {
            const root = readXml(`<a xmlns:xml="${xmlNamespace}" xml:lang="en"/>`);
            expect(root.attributes[0]!.namespace).to.equal(xmlNamespace);
        });

        test('An empty default namespace declaration undeclares it', () => {
            const root = readXml('<a xmlns="urn:a"><b xmlns=""/></a>');
            const child = childElement(root, 0);
            expect(child.namespace).to.equal(null);
            expect(child.inScopeNamespaces).to.deep.equal(new Map([['xml', xmlNamespace]]));
        });

        test('In-scope namespaces include the default and every declared prefix', () => {
            const root = readXml('<a xmlns="urn:a" xmlns:p="urn:p"><b xmlns:q="urn:q"/></a>');
            expect(childElement(root, 0).inScopeNamespaces).to.deep.equal(
                new Map([
                    ['xml', xmlNamespace],
                    ['', 'urn:a'],
                    ['p', 'urn:p'],
                    ['q', 'urn:q'],
                ])
            );
        });

        test('A child without declarations shares its parent in-scope namespaces', () => {
            const root = readXml('<a xmlns:p="urn:p"><b/></a>');
            expect(childElement(root, 0).inScopeNamespaces).to.equal(root.inScopeNamespaces);
        });

        test('A declaration on a child does not change its parent', () => {
            const root = readXml('<a><b xmlns:p="urn:p"/></a>');
            expect(root.inScopeNamespaces.has('p')).to.equal(false);
        });

        test('Attributes with the same local name in different namespaces are distinct', () => {
            const root = readXml('<a xmlns:p="urn:p" xmlns:q="urn:q" p:x="1" q:x="2" x="3"/>');
            expect(root.attributes.map(attribute => attribute.namespace)).to.deep.equal([
                'urn:p',
                'urn:q',
                null,
            ]);
        });
    });

    suite('Locations', () => {
        test('Counts \\r\\n as one line break', () => {
            const root = readXml('<a>\r\n  <b/>\r\n</a>');
            expect(childElement(root, 1).location).to.deep.equal({ line: 2, column: 3, offset: 7 });
        });

        test('Counts a lone \\r as a line break', () => {
            const root = readXml('<a>\r<b/>\n<c/></a>');
            expect(childElement(root, 1).location).to.deep.equal({ line: 2, column: 1, offset: 4 });
            expect(childElement(root, 3).location).to.deep.equal({ line: 3, column: 1, offset: 9 });
        });

        test('Normalizes line breaks in text', () => {
            expect((readXml('<a>x\r\ny\rz</a>').children.at(0) as XmlTextNode).text).to.equal(
                'x\ny\nz'
            );
        });

        test('Locates attributes across lines and past values containing markup', () => {
            const root = readXml(`<a x="y=1 >" y='"2"'\r\n   z = "3"/>`);
            expect(root.attributes.map(attribute => attribute.location)).to.deep.equal([
                { line: 1, column: 4, offset: 3 },
                { line: 1, column: 14, offset: 13 },
                { line: 2, column: 4, offset: 25 },
            ]);
        });

        test('Counts columns and offsets in UTF-16 code units', () => {
            const root = readXml('<a>\u{1F600}<b/></a>');
            expect(childElement(root, 1).location).to.deep.equal({ line: 1, column: 6, offset: 5 });
        });
    });

    suite('Not well-formed', () => {
        test('A missing end tag is an error, caused by the tokenizer error', () => {
            expect(() => readXml('<a>\n  <b>\n</a>'))
                .to.throw(
                    XeneverXmlError,
                    /^Not well-formed XML: Missing end tag for element b \(at \/,/v
                )
                .that.includes({ line: 3, column: 1, offset: 10, path: '/' })
                .and.has.property('cause')
                .that.is.instanceOf(XmlError);
        });

        test('Locates tokenizer errors in UTF-16 code units', () => {
            expectXmlError('<a>\u{1F600}\u{1F600}<</a>', /Not well-formed/v, {
                line: 1,
                column: 8,
                offset: 7,
                path: '/',
            });
        });

        test('An undefined entity is an error', () => {
            expectXmlError('<a>&custom;</a>', /Named entity isn't defined/v, {
                line: 1,
                column: 4,
                offset: 3,
                path: '/',
            });
        });

        for (const [description, declaration] of [
            [
                'no space before `standalone`',
                '<?xml version="1.0" encoding="UTF-8"standalone="yes"?>',
            ],
            ['an empty encoding', '<?xml version="1.0" encoding=""?>'],
        ] as const) {
            test(`An XML declaration with ${description} is an error`, () => {
                expect(() => readXml(`${declaration}<a/>`)).to.throw(
                    XeneverXmlError,
                    /^Not well-formed XML/v
                );
            });
        }

        test('An empty document is an error', () => {
            expectXmlError('', /Root element is missing/v, {
                line: 1,
                column: 1,
                offset: 0,
                path: '/',
            });
        });

        for (const [description, xml] of [
            ['an unclosed comment', '<a><!-- </a>'],
            ['an unclosed CDATA section', '<a><![CDATA[ </a>'],
            ['an unclosed processing instruction', '<a><?pi </a>'],
            ['an unclosed end tag', '<a></a'],
            ['an unclosed attribute value', '<a b="1></a>'],
        ] as const) {
            test(`Leaves ${description} to the tokenizer`, () => {
                expect(() => readXml(xml)).to.throw(XeneverXmlError, /^Not well-formed XML/v);
            });
        }
    });

    suite('DTDs and entities', () => {
        test('A DOCTYPE is an error', () => {
            expectXmlError('<?xml version="1.0"?>\n<!DOCTYPE a>\n<a/>', /DOCTYPE is not allowed/v, {
                line: 2,
                column: 1,
                offset: 22,
                path: '/',
            });
        });

        test('Billion laughs is rejected at its DOCTYPE', () => {
            const lol = [
                '<!DOCTYPE lolz [',
                '  <!ENTITY lol "lol">',
                ...Array.from({ length: 9 }, (_, index) => {
                    const reference = index === 0 ? '&lol;' : `&lol${index};`;
                    return `  <!ENTITY lol${index + 1} "${reference.repeat(10)}">`;
                }),
                ']>',
                '<lolz>&lol9;</lolz>',
            ].join('\n');
            expectXmlError(lol, /DOCTYPE is not allowed/v, {
                line: 1,
                column: 1,
                offset: 0,
                path: '/',
            });
        });

        test('An external entity is rejected at its DOCTYPE', () => {
            expectXmlError(
                '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><a>&xxe;</a>',
                /DOCTYPE is not allowed/v,
                { line: 1, column: 22, offset: 21, path: '/' }
            );
        });

        test('A DOCTYPE inside an element is an error', () => {
            expectXmlError('<a><!DOCTYPE a></a>', /DOCTYPE is not allowed/v, {
                line: 1,
                column: 4,
                offset: 3,
                path: '/',
            });
        });

        test('DOCTYPE text in a comment, CDATA section or processing instruction is not a DOCTYPE', () => {
            const root = readXml(
                '<!-- <!DOCTYPE a> --><?pi <!DOCTYPE a>?><a><![CDATA[<!DOCTYPE a><b>]]></a>'
            );
            expect(root.children).to.deep.equal([
                {
                    kind: 'text',
                    text: '<!DOCTYPE a><b>',
                    location: { line: 1, column: 44, offset: 43 },
                },
            ]);
        });
    });

    suite('Depth', () => {
        const nested = (depth: number, innermost = '<a>'): string =>
            `${'<a>'.repeat(depth - 1)}${innermost}${'</a>'.repeat(depth)}`;

        test(`Reads elements nested ${maxElementDepth} deep`, () => {
            expect(readXml(nested(maxElementDepth)).localName).to.equal('a');
        });

        test(`Elements nested deeper than ${maxElementDepth} are an error`, () => {
            const offset = maxElementDepth * '<a>'.length;
            expectXmlError(nested(maxElementDepth + 1), /nested deeper than 256/v, {
                offset,
                line: 1,
                column: offset + 1,
                path: '/',
            });
        });

        test('An empty element counts toward the depth', () => {
            expect(() => readXml(nested(maxElementDepth + 1, '<a/>'))).to.throw(
                XeneverXmlError,
                /nested deeper/v
            );
        });

        test('Siblings do not add to the depth', () => {
            const root = readXml(`<r>${'<a/><b x=">"></b>'.repeat(maxElementDepth + 1)}</r>`);
            expect(root.children).to.have.length((maxElementDepth + 1) * 2);
        });

        test('Very deep nesting is an error, not a stack overflow', () => {
            expect(() => readXml(nested(100_000))).to.throw(XeneverXmlError, /nested deeper/v);
        });
    });

    suite('Namespace errors', () => {
        for (const name of [
            'a:b:c',
            ':a',
            'a:',
            'a:1b',
            'a:-b',
            'a:.b',
            'a:\u{B7}b',
            'a:\u{301}b',
            'a:\u{2040}b',
        ]) {
            test(`Element name \`${name}\` is an error`, () => {
                expectXmlError(`<x>\n <${name}/></x>`, /is not a valid QName/v, {
                    line: 2,
                    column: 2,
                    offset: 5,
                    path: `/x/${name}`,
                });
            });
        }

        test('A name starting with a character just outside the name-only ranges is a QName', () => {
            expect(readXml('<p:a xmlns:p="urn:p"><p:\u{370}/></p:a>').children).to.have.length(1);
        });

        test('An attribute name that is not a QName is an error', () => {
            expectXmlError(
                '<x a="1"\n  b:c:d="2"/>',
                /Attribute name `b:c:d` is not a valid QName/v,
                {
                    line: 2,
                    column: 3,
                    offset: 11,
                    path: '/x/@b:c:d',
                }
            );
        });

        test('The xmlns prefix on an element is an error', () => {
            expectXmlError('<xmlns:a/>', /must not have the prefix `xmlns`/v, {
                line: 1,
                column: 1,
                offset: 0,
                path: '/xmlns:a',
            });
        });

        test('An undeclared element prefix is an error', () => {
            expectXmlError('<a>\n<p:b/></a>', /Prefix `p` is not declared/v, {
                line: 2,
                column: 1,
                offset: 4,
                path: '/a/p:b',
            });
        });

        test('An undeclared attribute prefix is an error', () => {
            expectXmlError('<a x="1" p:y="2"/>', /Prefix `p` is not declared/v, {
                line: 1,
                column: 10,
                offset: 9,
                path: '/a/@p:y',
            });
        });

        test('A prefix declared on a sibling is not in scope', () => {
            expectXmlError('<a><b xmlns:p="urn:p"/><p:c/></a>', /Prefix `p` is not declared/v, {
                line: 1,
                column: 24,
                offset: 23,
                path: '/a/p:c',
            });
        });

        for (const [description, declaration, reason] of [
            ['declaring xmlns', 'xmlns:xmlns="urn:x"', /prefix `xmlns` must not be declared/v],
            [
                'binding xml to another namespace',
                'xmlns:xml="urn:x"',
                /prefix `xml` must not be bound to any namespace but/v,
            ],
            [
                'binding another prefix to the xml namespace',
                `xmlns:p="${xmlNamespace}"`,
                /Only the prefix `xml` may be bound/v,
            ],
            [
                'making the xml namespace the default',
                `xmlns="${xmlNamespace}"`,
                /Only the prefix `xml` may be bound/v,
            ],
            [
                'binding a prefix to the xmlns namespace',
                `xmlns:p="${xmlnsNamespace}"`,
                /No prefix may be bound/v,
            ],
            [
                'making the xmlns namespace the default',
                `xmlns="${xmlnsNamespace}"`,
                /No prefix may be bound/v,
            ],
            ['undeclaring a prefix', 'xmlns:p=""', /prefix `p` must not be undeclared/v],
        ] as const) {
            test(`${description} is an error`, () => {
                expectXmlError(`<a\n  ${declaration}/>`, reason, {
                    line: 2,
                    column: 3,
                    offset: 5,
                    path: `/a/@${declaration.slice(0, declaration.indexOf('='))}`,
                });
            });
        }

        test('Two attributes with the same namespace and local name are an error', () => {
            expectXmlError(
                '<a xmlns:p="urn:x" xmlns:q="urn:x" p:b="1" q:b="2"/>',
                /Attribute `b` in namespace `urn:x` is repeated/v,
                { line: 1, column: 44, offset: 43, path: '/a/@q:b' }
            );
        });

        test('A processing instruction target with a colon is an error', () => {
            expectXmlError('<a>\n<?p:i x?></a>', /target `p:i` must not contain a colon/v, {
                line: 2,
                column: 1,
                offset: 4,
                path: '/a',
            });
        });

        test('A processing instruction target with a colon outside the root is an error', () => {
            expectXmlError('<a/><?p:i?>', /target `p:i` must not contain a colon/v, {
                line: 1,
                column: 5,
                offset: 4,
                path: '/',
            });
        });
    });
});
