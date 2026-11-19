import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parse, x, XeneverValidationError } from 'xenever';

const xsi = 'http://www.w3.org/2001/XMLSchema-instance';

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
    location: Readonly<Record<string, number | string>>
): void => {
    expect(run).to.throw(XeneverValidationError, reason).that.includes(location);
};

/**
 * A root `r` of `i` elements, each with a `v` attribute of the type given, and the constraints given.
 *
 * @param type - type of `v`
 * @param identity - the root's identity constraints
 * @returns the declaration
 */
const items = (type: x.SimpleType, identity: readonly x.IdentityConstraint[]): x.Element =>
    x.element(
        'r',
        x.complex({
            content: x.sequence([
                x.element('i', x.complex({ attributes: [x.attribute('v', type)] }), {
                    minOccurs: 0,
                    maxOccurs: 'unbounded',
                }),
            ]),
        }),
        { identity }
    );

/**
 * Whether two texts of a type are equal for a `unique` constraint.
 *
 * @param type - their type
 * @param a - one text
 * @param b - another
 * @returns whether the constraint rejects them as duplicates
 * @throws {Error} when parsing fails for another reason
 */
const isDuplicate = (type: x.SimpleType, a: string, b: string): boolean => {
    try {
        parse(
            `<r xmlns:p="urn:p" xmlns:q="urn:p"><i v="${a}"/><i v="${b}"/></r>`,
            items(type, [x.unique('u', 'i', ['@v'])])
        );
        return false;
    } catch (error) {
        if (error instanceof XeneverValidationError) {
            return true;
        }
        throw error;
    }
};

const item = x.element(
    'i',
    x.complex({
        attributes: [x.attribute('k', x.int()), x.attribute('n', x.string())],
        content: x.sequence([x.element('c', x.decimal(), { minOccurs: 0 })]),
    }),
    { minOccurs: 0, maxOccurs: 'unbounded' }
);

/**
 * A root `r` of `i` elements, each with `k` and `n` attributes and an optional `c` child.
 *
 * @param identity - the root's identity constraints
 * @returns the declaration
 */
const withItems = (identity: readonly x.IdentityConstraint[]): x.Element =>
    x.element('r', x.complex({ content: x.sequence([item]) }), { identity });

suite('Identity constraints', () => {
    suite('unique', () => {
        const root = withItems([x.unique('u', 'i', ['@k'])]);

        test('Accepts distinct values', () => {
            expect(parse('<r><i k="1"/><i k="2"/></r>', root)).to.deep.equal({
                attributes: {},
                children: {
                    i: [
                        { attributes: { k: 1 }, children: {} },
                        { attributes: { k: 2 }, children: {} },
                    ],
                },
            });
        });

        test('Rejects equal values at the second element, naming the first', () => {
            expectInvalid(
                () => parse('<r><i k="1"/>\n<i k="01"/></r>', root),
                /^Element `i` has the values \("01"\) of `\/r\/i\[1\]` too, breaking unique `u` of `\/r`/v,
                { path: '/r/i[2]', line: 2, column: 1 }
            );
        });

        test('Skips elements missing a field', () => {
            expect(() => parse('<r><i/><i/><i k="1"/></r>', root)).not.to.throw();
        });

        test('Compares every field together', () => {
            const pair = withItems([x.unique('u', 'i', ['@k', '@n'])]);
            expect(() => parse('<r><i k="1" n="a"/><i k="1" n="b"/></r>', pair)).not.to.throw();
            expectInvalid(
                () => parse('<r><i k="1" n="a"/><i k="1" n="a"/></r>', pair),
                /has the values \("1", "a"\) of `\/r\/i\[1\]` too/v,
                { path: '/r/i[2]' }
            );
        });

        test('Reads an element field', () => {
            const byChild = withItems([x.unique('u', 'i', ['c'])]);
            expectInvalid(
                () => parse('<r><i><c>1.0</c></i><i><c> 1 </c></i></r>', byChild),
                /^Element `i` has the values \(" 1 "\) of `\/r\/i\[1\]` too/v,
                { path: '/r/i[2]' }
            );
        });
    });

    suite('key', () => {
        const root = withItems([x.key('k', 'i', ['@k'])]);

        test('Accepts distinct values', () => {
            expect(() => parse('<r><i k="1"/><i k="2"/></r>', root)).not.to.throw();
        });

        test('Rejects an element missing a field', () => {
            expectInvalid(
                () => parse('<r><i k="1"/><i n="x"/></r>', root),
                /^Element `i` has no value for the field "@k" of key `k` of `\/r`/v,
                { path: '/r/i[2]' }
            );
        });

        test('Rejects equal values', () => {
            expectInvalid(
                () => parse('<r><i k="1"/><i k="1"/></r>', root),
                /breaking key `k` of `\/r`/v,
                { path: '/r/i[2]' }
            );
        });

        test('Rejects a field whose element is nillable, even when not nil', () => {
            const nillable = x.element(
                'r',
                x.complex({
                    content: x.sequence([
                        x.element(
                            'i',
                            x.complex({
                                content: x.sequence([x.element('c', x.int(), { nillable: true })]),
                            })
                        ),
                    ]),
                }),
                { identity: [x.key('k', 'i', ['c'])] }
            );
            expectInvalid(
                () => parse('<r><i><c>1</c></i></r>', nillable),
                /^The field "c" of key `k` selects `\/r\/i\/c`, which is nillable, so it can not be part of a key/v,
                { path: '/r/i/c' }
            );
        });
    });

    suite('Value space', () => {
        for (const [description, type, a, b] of [
            ['decimals of different lexical forms', x.decimal(), '1.50', '+01.5'],
            ['booleans written as words and digits', x.boolean(), 'true', '1'],
            ['strings after whitespace processing', x.token(), ' a  b', 'a b'],
            [
                'dates with timezones, on the timeline',
                x.dateTime(),
                '2026-01-01T00:00:00Z',
                '2026-01-01T01:00:00+01:00',
            ],
            ['dates without timezones', x.date(), '2026-01-01', '2026-01-01'],
            ['times with fraction digits', x.time(), '10:00:00.50Z', '10:00:00.5Z'],
            ['durations of months and years', x.duration(), 'P1Y', 'P12M'],
            ['durations of days and hours', x.duration(), 'P1D', 'PT24H'],
            ['floats, zero and negative zero', x.float(), '0', '-0'],
            ['hex binary of either case', x.hexBinary(), 'ab', 'AB'],
            ['base64 binary spaced out', x.base64Binary(), 'AQID', 'AQ ID'],
            ['QNames of one namespace with different prefixes', x.qname(), 'p:a', 'q:a'],
            [
                'union values in the member that reads them',
                x.union([x.int(), x.string()]),
                '01',
                '1',
            ],
            ['lists item by item', x.list(x.int()), '1 2', '01  2'],
            ['empty lists', x.list(x.int()), '', ' '],
        ] as const) {
            test(`Equates ${description}`, () => {
                expect(isDuplicate(type, a, b)).to.equal(true);
            });
        }

        for (const [description, type, a, b] of [
            [
                'a date with a timezone and one without',
                x.dateTime(),
                '2026-01-01T00:00:00Z',
                '2026-01-01T00:00:00',
            ],
            ['durations of a month and of 30 days', x.duration(), 'P1M', 'P30D'],
            ['QNames of different namespaces', x.qname(), 'p:a', 'a'],
            ['lists of different lengths', x.list(x.int()), '1', '1 1'],
            ['union values of different members', x.union([x.int(), x.string()]), '1', 'a'],
        ] as const) {
            test(`Tells apart ${description}`, () => {
                expect(isDuplicate(type, a, b)).to.equal(false);
            });
        }

        test('Equates values of types derived from one primitive', () => {
            const root = x.element(
                'r',
                x.complex({
                    content: x.sequence([
                        x.element('a', x.complex({ attributes: [x.attribute('v', x.decimal())] })),
                        x.element('b', x.complex({ attributes: [x.attribute('v', x.byte())] })),
                    ]),
                }),
                { identity: [x.unique('u', 'a | b', ['@v'])] }
            );
            expectInvalid(
                () => parse('<r><a v="1.0"/><b v="1"/></r>', root),
                /has the values \("1"\) of `\/r\/a` too/v,
                { path: '/r/b' }
            );
        });

        for (const [description, first, second] of [
            ['a string and a decimal', x.string(), x.decimal()],
            ['a string and an anyURI', x.string(), x.anyUri()],
            ['a float and a double', x.float(), x.double()],
            ['a list and its item', x.list(x.int()), x.int()],
        ] as const) {
            test(`Tells apart ${description} of one text`, () => {
                const root = x.element(
                    'r',
                    x.complex({
                        content: x.sequence([
                            x.element('a', x.complex({ attributes: [x.attribute('v', first)] })),
                            x.element('b', x.complex({ attributes: [x.attribute('v', second)] })),
                        ]),
                    }),
                    { identity: [x.unique('u', 'a | b', ['@v'])] }
                );
                expect(() => parse('<r><a v="1"/><b v="1"/></r>', root)).not.to.throw();
            });
        }
    });

    suite('Selectors and fields', () => {
        test('Selects descendants with `.//`, and paths joined by `|`, in document order', () => {
            const root = x.element(
                'r',
                x.complex({
                    content: x.sequence([
                        x.element('g', x.complex({ content: x.sequence([item]) }), {
                            minOccurs: 0,
                            maxOccurs: 'unbounded',
                        }),
                        item,
                    ]),
                }),
                { identity: [x.unique('u', 'i | .//g/i', ['@k'])] }
            );
            expectInvalid(
                () => parse('<r><g><i k="1"/></g><g><i k="2"/></g><i k="1"/></r>', root),
                /of `\/r\/g\[1\]\/i` too/v,
                { path: '/r/i' }
            );
        });

        test('Selects the element itself with `.`', () => {
            const element = x.element('i', x.complex({ attributes: [x.attribute('k', x.int())] }), {
                identity: [x.key('k', '.', ['@k'])],
            });
            expectInvalid(
                () => parse('<i/>', element),
                /^Element `i` has no value for the field "@k" of key `k` of `\/i`/v,
                { path: '/i' }
            );
        });

        test('Matches names by namespace, through the prefixes of `namespaces`', () => {
            const root = x.element(
                'r',
                x.complex({
                    content: x.sequence([
                        x.element(
                            'i',
                            x.complex({
                                attributes: [x.attribute('k', x.int(), { namespace: 'urn:p' })],
                            }),
                            {
                                namespace: 'urn:p',
                                maxOccurs: 'unbounded',
                            }
                        ),
                    ]),
                }),
                {
                    namespace: 'urn:p',
                    identity: [x.unique('u', 'p:i', ['@p:k'], { namespaces: { p: 'urn:p' } })],
                }
            );
            expectInvalid(
                () => parse('<r xmlns="urn:p" xmlns:a="urn:p"><i a:k="1"/><i a:k="1"/></r>', root),
                /breaking unique `u` of `\/r`/v,
                { path: '/r/i[2]' }
            );
        });

        test('Reads an attribute filled in by its default', () => {
            const root = x.element(
                'r',
                x.complex({
                    content: x.sequence([
                        x.element(
                            'i',
                            x.complex({
                                attributes: [x.attribute('k', x.int(), { default: '1' })],
                            }),
                            {
                                maxOccurs: 'unbounded',
                            }
                        ),
                    ]),
                }),
                { identity: [x.unique('u', 'i', ['@*'])] }
            );
            expectInvalid(
                () => parse('<r><i k="1"/><i/></r>', root),
                /^Element `i` has the values \("1"\) of `\/r\/i\[1\]` too/v,
                { path: '/r/i[2]' }
            );
        });

        test('Reads an element filled in by its default, and the text of a complex type', () => {
            const root = x.element(
                'r',
                x.complex({
                    content: x.sequence([
                        x.element('a', x.int(), { default: '1' }),
                        x.element(
                            'b',
                            x.complex({ text: x.int(), attributes: [x.attribute('x', x.int())] })
                        ),
                    ]),
                }),
                { identity: [x.unique('u', 'a | b', ['.'])] }
            );
            expectInvalid(() => parse('<r><a/><b x="2">1</b></r>', root), /of `\/r\/a` too/v, {
                path: '/r/b',
            });
        });

        test('Reads a filled-in QName against the namespaces of its declaration', () => {
            const root = x.element(
                'r',
                x.complex({
                    content: x.sequence([
                        x.element(
                            'i',
                            x.complex({
                                attributes: [
                                    x.attribute('k', x.qname(), {
                                        default: 'p:a',
                                        namespaces: { p: 'urn:p' },
                                    }),
                                ],
                            }),
                            { minOccurs: 0, maxOccurs: 'unbounded' }
                        ),
                        x.element('e', x.qname(), {
                            default: 'a',
                            namespaces: { '': 'urn:p' },
                            minOccurs: 0,
                            maxOccurs: 'unbounded',
                        }),
                    ]),
                }),
                { identity: [x.unique('u', 'i', ['@k']), x.unique('v', 'e', ['.'])] }
            );
            expectInvalid(
                () => parse('<r xmlns:p="urn:other" xmlns:q="urn:p"><i k="q:a"/><i/></r>', root),
                /^Element `i` has the values \("p:a"\) of `\/r\/i\[1\]` too/v,
                { path: '/r/i[2]' }
            );
            expectInvalid(
                () => parse('<r xmlns:q="urn:p"><e>q:a</e><e/></r>', root),
                /^Element `e` has the values \("a"\) of `\/r\/e\[1\]` too/v,
                { path: '/r/e[2]' }
            );
            expect(() =>
                parse('<r xmlns:p="urn:other"><i k="p:a"/><i/><e>a</e><e/></r>', root)
            ).not.to.throw();
        });

        test('Leaves out a nil element, as having no value', () => {
            const root = x.element(
                'r',
                x.complex({
                    content: x.sequence([
                        x.element('i', x.int(), { nillable: true, maxOccurs: 'unbounded' }),
                    ]),
                }),
                { identity: [x.unique('u', 'i', ['.'])] }
            );
            expect(() =>
                parse(
                    '<r xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><i xsi:nil="true"/><i xsi:nil="true"/></r>',
                    root
                )
            ).not.to.throw();
        });

        test('Reads an element a wildcard validated against its declaration', () => {
            const value = x.element('v', x.int());
            const root = x.element(
                'r',
                x.complex({
                    content: x.sequence([
                        x.any({
                            processContents: 'lax',
                            declarations: () => [value],
                            maxOccurs: 'unbounded',
                        }),
                    ]),
                }),
                { identity: [x.unique('u', 'v', ['.'])] }
            );
            expectInvalid(() => parse('<r><v>1</v><v>01</v></r>', root), /breaking unique/v, {
                path: '/r/v[2]',
            });
        });

        test('Reads an attribute a wildcard validated against its declaration', () => {
            const value = x.attribute('v', x.int());
            const root = x.element(
                'r',
                x.complex({
                    content: x.sequence([
                        x.element(
                            'i',
                            x.complex({
                                attributes: [x.anyAttribute({ declarations: () => [value] })],
                            }),
                            { maxOccurs: 'unbounded' }
                        ),
                    ]),
                }),
                { identity: [x.unique('u', 'i', ['@v'])] }
            );
            expectInvalid(() => parse('<r><i v="1"/><i v="01"/></r>', root), /breaking unique/v, {
                path: '/r/i[2]',
            });
        });

        test('Selects xsi attributes, by their built-in types', () => {
            const root = x.element(
                'r',
                x.complex({
                    content: x.sequence([
                        x.element('i', x.complex({ text: x.int() }), {
                            nillable: true,
                            maxOccurs: 'unbounded',
                        }),
                    ]),
                }),
                { identity: [x.unique('u', 'i', ['@xsi:nil'], { namespaces: { xsi } })] }
            );
            expectInvalid(
                () =>
                    parse(
                        `<r xmlns:xsi="${xsi}"><i xsi:nil="false">1</i><i xsi:nil="0">2</i></r>`,
                        root
                    ),
                /^Element `i` has the values \("0"\) of `\/r\/i\[1\]` too, breaking unique `u`/v,
                { path: '/r/i[2]' }
            );
            const any = x.element('r', root.type, {
                identity: [x.unique('u', 'i', ['@*'])],
            });
            // `@*` selects the xsi attributes too: https://www.w3.org/Bugs/Public/show_bug.cgi?id=4061
            expectInvalid(
                () =>
                    parse(
                        `<r xmlns:xsi="${xsi}"><i xsi:nil="true" xsi:noNamespaceSchemaLocation="i.xsd"/></r>`,
                        any
                    ),
                /selects more than one node/v,
                { path: '/r/i' }
            );
        });

        test('Rejects a field selecting more than one node', () => {
            const root = withItems([x.unique('u', '.', ['i/@k'])]);
            expectInvalid(
                () => parse('<r><i k="1"/><i k="2"/></r>', root),
                /^The field "i\/@k" of unique `u` selects more than one node from `\/r`/v,
                { path: '/r' }
            );
        });

        test('Counts a node selected by two paths once', () => {
            const root = withItems([x.unique('u', 'i', ['@k | @k'])]);
            expect(() => parse('<r><i k="1"/></r>', root)).not.to.throw();
        });

        test('Rejects a field selecting an element without a simple type', () => {
            const root = withItems([x.unique('u', '.', ['i'])]);
            expectInvalid(
                () => parse('<r><i/></r>', root),
                /^The field "i" of unique `u` selects `\/r\/i`, which has no simple type/v,
                { path: '/r/i' }
            );
        });

        test('Rejects a field selecting what a skip wildcard allowed', () => {
            const root = x.element(
                'r',
                x.complex({
                    attributes: [x.anyAttribute({ processContents: 'skip' })],
                    content: x.sequence([x.any({ processContents: 'skip' })]),
                }),
                {
                    identity: [
                        x.unique('a', '.', ['@v']),
                        x.unique('e', '.', ['*/@v']),
                        x.unique('x', '.', ['@xsi:other'], { namespaces: { xsi } }),
                    ],
                }
            );
            expectInvalid(
                () => parse(`<r xmlns:xsi="${xsi}" xsi:other="1"><e/></r>`, root),
                /^The field "@xsi:other" of unique `x` selects `\/r\/@xsi:other`, which has no simple type/v,
                { path: '/r/@xsi:other' }
            );
            expectInvalid(
                () => parse('<r v="1"><e/></r>', root),
                /^The field "@v" of unique `a` selects `\/r\/@v`, which has no simple type/v,
                { path: '/r/@v' }
            );
            expectInvalid(
                () => parse('<r><e v="1"/></r>', root),
                /^The field "\*\/@v" of unique `e` selects `\/r\/e\/@v`, which has no simple type/v,
                { path: '/r/e/@v' }
            );
        });

        test('Reads a defaulted attribute through child steps', () => {
            const root = x.element(
                'r',
                x.complex({
                    content: x.sequence([
                        x.element(
                            'i',
                            x.complex({
                                content: x.sequence([
                                    x.element(
                                        'c',
                                        x.complex({
                                            attributes: [
                                                x.attribute('k', x.int(), { default: '1' }),
                                            ],
                                        })
                                    ),
                                ]),
                            }),
                            { maxOccurs: 'unbounded' }
                        ),
                    ]),
                }),
                { identity: [x.key('k', 'i', ['c/@k'])] }
            );
            expect(() => parse('<r><i><c/></i><i><c k="2"/></i></r>', root)).not.to.throw();
            expectInvalid(
                () => parse('<r><i><c/></i><i><c k="1"/></i></r>', root),
                /breaking key/v,
                {
                    path: '/r/i[2]',
                }
            );
        });
    });

    suite('keyref', () => {
        const groupKey = x.key('k', 'i', ['@k']);
        const ref = x.element('ref', x.complex({ attributes: [x.attribute('k', x.int())] }), {
            minOccurs: 0,
            maxOccurs: 'unbounded',
        });
        const group: x.Element = x.element(
            'g',
            x.complex({
                content: x.sequence([
                    x.lazy((): x.Element => group, { minOccurs: 0, maxOccurs: 'unbounded' }),
                    item,
                    ref,
                ]),
            }),
            { identity: [groupKey], minOccurs: 0, maxOccurs: 'unbounded' }
        );

        /**
         * A root of groups and references, each group keying its items.
         *
         * @param identity - the root's identity constraints
         * @returns the declaration
         */
        const groups = (identity: readonly x.IdentityConstraint[]): x.Element =>
            x.element('r', x.complex({ content: x.sequence([group, ref]) }), { identity });

        const root = groups([x.keyref('ref', groupKey, 'ref', ['@k'])]);

        test('Resolves to a key of the element itself', () => {
            const element = withItems([
                x.key('k', 'i', ['@k']),
                x.keyref('ref', { name: 'k' }, 'i', ['c']),
            ]);
            expectInvalid(
                () => parse('<r><i k="1"><c>1.0</c></i><i k="2"><c>3</c></i></r>', element),
                /^Element `i` has values \("3"\) that match nothing of `k`, breaking keyref `ref` of `\/r`/v,
                { path: '/r/i[2]' }
            );
        });

        test('Accepts values propagated from descendants', () => {
            expect(() =>
                parse('<r><g><i k="1"/></g><g><i k="2"/></g><ref k="2"/></r>', root)
            ).not.to.throw();
        });

        test('Skips elements missing a field', () => {
            expect(() => parse('<r><ref/></r>', root)).not.to.throw();
        });

        test('Rejects a value no descendant has', () => {
            expectInvalid(
                () => parse('<r><g><i k="1"/></g><ref k="2"/></r>', root),
                /^Element `ref` has values \("2"\) that match nothing of `k`, breaking keyref `ref` of `\/r`/v,
                { path: '/r/ref' }
            );
        });

        test('Never resolves to a key of an ancestor', () => {
            const inner = x.element('g', x.complex({ content: x.sequence([item, ref]) }), {
                identity: [x.keyref('ref', groupKey, 'ref', ['@k'])],
            });
            const outer = x.element('o', x.complex({ content: x.sequence([item, inner]) }), {
                identity: [groupKey],
            });
            expectInvalid(
                () => parse('<o><i k="1"/><g><ref k="1"/></g></o>', outer),
                /breaking keyref `ref` of `\/o\/g`/v,
                { path: '/o/g/ref' }
            );
        });

        test('Leaves out a value two children have', () => {
            expectInvalid(
                () => parse('<r><g><i k="1"/></g><g><i k="1"/></g><ref k="1"/></r>', root),
                /match nothing of `k`/v,
                { path: '/r/ref' }
            );
        });

        test('Leaves out a value two children have, whichever table is larger', () => {
            const xml = (third: string, value: number): string =>
                `<r><g><g><i k="1"/></g><g><i k="1"/></g><g>${third}</g></g><ref k="${value}"/></r>`;
            const larger = '<i k="5"/><i k="6"/><i k="7"/>';
            expect(() => parse(xml(larger, 5), root)).not.to.throw();
            expectInvalid(() => parse(xml(larger, 1), root), /match nothing/v, {
                path: '/r/ref',
            });
            expectInvalid(
                () => parse(xml('<i k="1"/><i k="5"/><i k="6"/>', 1), root),
                /match nothing/v,
                { path: '/r/ref' }
            );
            expectInvalid(
                () =>
                    parse(
                        '<r><g><g><i k="1"/><i k="2"/></g><g><i k="1"/><i k="3"/></g><g><i k="1"/></g></g><ref k="1"/></r>',
                        root
                    ),
                /match nothing/v,
                { path: '/r/ref' }
            );
        });

        test("Takes an element's own values over its children's conflicting ones", () => {
            expect(() =>
                parse(
                    '<r><g><g><i k="1"/></g><g><i k="1"/></g><i k="1"/></g><ref k="1"/></r>',
                    root
                )
            ).not.to.throw();
        });

        test('Resolves two keyrefs to one key, at different depths', () => {
            const twice = groups([
                x.keyref('ref', groupKey, 'ref', ['@k']),
                x.keyref('deep', groupKey, './/g/ref', ['@k']),
            ]);
            expect(() =>
                parse('<r><g><i k="1"/><ref k="1"/></g><ref k="1"/></r>', twice)
            ).not.to.throw();
        });

        test('Keeps the tables of different keys apart', () => {
            const aKey = x.key('a', 'i', ['@k']);
            const bKey = x.key('b', 'i', ['@k']);
            const holder = (elementName: string, key: x.IdentityConstraint): x.Element =>
                x.element(elementName, x.complex({ content: x.sequence([item]) }), {
                    identity: [key],
                });
            const element = x.element(
                'r',
                x.complex({
                    content: x.sequence([holder('a', aKey), holder('b', bKey), ref]),
                }),
                {
                    identity: [
                        x.keyref('toA', aKey, 'ref', ['@k']),
                        x.keyref('toB', bKey, 'ref', ['@k']),
                    ],
                }
            );
            expect(() =>
                parse('<r><a><i k="1"/></a><b><i k="1"/></b><ref k="1"/></r>', element)
            ).not.to.throw();
            expectInvalid(
                () => parse('<r><a><i k="1"/></a><b><i k="2"/></b><ref k="1"/></r>', element),
                /match nothing of `b`, breaking keyref `toB`/v,
                { path: '/r/ref' }
            );
        });

        test('Checks keyrefs of nested elements against their own tables', () => {
            const selfRef = x.keyref('own', groupKey, 'ref', ['@k']);
            const nested: x.Element = x.element(
                'g',
                x.complex({
                    content: x.sequence([
                        x.lazy((): x.Element => nested, { minOccurs: 0, maxOccurs: 'unbounded' }),
                        item,
                        ref,
                    ]),
                }),
                { identity: [groupKey, selfRef] }
            );
            expect(() =>
                parse('<g><g><i k="2"/><ref k="2"/></g><ref k="2"/></g>', nested)
            ).not.to.throw();
            expectInvalid(
                () => parse('<g><g><ref k="1"/></g><i k="1"/></g>', nested),
                /breaking keyref `own` of `\/g\/g`/v,
                { path: '/g/g/ref' }
            );
        });
    });
});
