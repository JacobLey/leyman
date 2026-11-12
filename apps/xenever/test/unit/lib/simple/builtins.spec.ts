import type { x as X } from 'xenever';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parse, x, XeneverValidationError } from 'xenever';

/**
 * Reads a text as a simple type, as the content of an element.
 *
 * @param type - schema value of the type
 * @param text - the element's text
 * @returns its value
 */
const read = (type: X.SimpleType, text: string): unknown =>
    parse(`<v>${text}</v>`, x.element('v', type));

/**
 * Asserts each text reads as the value given.
 *
 * @param type - schema value of the type
 * @param cases - each text and its value
 */
const expectValues = (
    type: X.SimpleType,
    cases: readonly (readonly [text: string, value: unknown])[]
): void => {
    for (const [text, value] of cases) {
        expect(read(type, text), text).to.deep.equal(value);
    }
};

/**
 * Asserts each text is invalid for the type.
 *
 * @param type - schema value of the type
 * @param texts - texts the type rejects
 * @param reason - matches the message
 */
const expectInvalid = (
    type: X.SimpleType,
    texts: readonly string[],
    reason = /is not a valid/v
): void => {
    for (const text of texts) {
        expect(() => read(type, text), text).to.throw(XeneverValidationError, reason);
    }
};

suite('Built-in types', () => {
    suite('Strings', () => {
        test('string keeps whitespace', () => {
            expectValues(x.string(), [
                [' a\tb\n', ' a\tb\n'],
                ['', ''],
            ]);
        });

        test('normalizedString replaces whitespace with spaces', () => {
            expectValues(x.normalizedString(), [[' a\tb\n', ' a b ']]);
        });

        test('token collapses whitespace', () => {
            expectValues(x.token(), [[' a \t b\n', 'a b']]);
        });

        test('language is a language tag', () => {
            expectValues(x.language(), [[' en-US ', 'en-US']]);
            expectInvalid(x.language(), ['en_US', 'toolonglanguage', '']);
        });

        test('NMTOKEN is name characters', () => {
            expectValues(x.nmtoken(), [['-1.a', '-1.a']]);
            expectInvalid(x.nmtoken(), ['a b', '']);
        });

        test('Name is an XML name', () => {
            expectValues(x.name(), [['a:b', 'a:b']]);
            expectInvalid(x.name(), ['1a']);
        });

        test('NCName, ID, IDREF and ENTITY are names without a colon', () => {
            // An IDREF alone names no ID, so its valid values are in the IDs tests of `parse`.
            for (const type of [x.ncName(), x.id(), x.entity()]) {
                expectValues(type, [['a.b', 'a.b']]);
            }
            for (const type of [x.ncName(), x.id(), x.idref(), x.entity()]) {
                expectInvalid(type, ['a:b', '-a']);
            }
        });

        test('anyURI is any text, collapsed', () => {
            expectValues(x.anyUri(), [[' https://example.com/a b ', 'https://example.com/a b']]);
        });
    });

    suite('Integers', () => {
        test('Reads an integer with a sign and leading zeros', () => {
            expectValues(x.int(), [
                ['+007', 7],
                ['-0', 0],
                [' -12 ', -12],
            ]);
        });

        test('Rejects what is not an integer', () => {
            expectInvalid(x.int(), ['1.0', '1e3', '', '+', '0x1']);
        });

        test('Checks the range of each type', () => {
            expectValues(x.byte(), [
                ['-128', -128],
                ['127', 127],
            ]);
            expectInvalid(x.byte(), ['-129', '128']);
            expectInvalid(x.short(), ['32768']);
            expectInvalid(x.int(), ['2147483648']);
            expectInvalid(x.unsignedByte(), ['256', '-1']);
            expectInvalid(x.unsignedShort(), ['65536']);
            expectInvalid(x.unsignedInt(), ['4294967296']);
            expectValues(x.unsignedInt(), [['-0', 0]]);
            expectInvalid(x.long({ bigint: true }), ['9223372036854775808']);
            expectInvalid(x.unsignedLong({ bigint: true }), ['18446744073709551616']);
            expectInvalid(x.positiveInteger(), ['0']);
            expectInvalid(x.nonNegativeInteger(), ['-1']);
            expectInvalid(x.negativeInteger(), ['0']);
            expectInvalid(x.nonPositiveInteger(), ['1']);
            expectValues(x.integer(), [['-9007199254740991', -9_007_199_254_740_991]]);
        });

        test('Rejects a value outside the safe range as a number', () => {
            expectInvalid(
                x.integer(),
                ['9007199254740992', '-9007199254740992'],
                /declare the type with `bigint: true`/v
            );
        });

        test('Reads a bigint when flagged', () => {
            expectValues(x.long({ bigint: true }), [
                ['9223372036854775807', 9_223_372_036_854_775_807n],
                ['-00', 0n],
            ]);
        });
    });

    suite('Decimal', () => {
        test('Reads the canonical form', () => {
            expectValues(x.decimal(), [
                ['+01.50', '1.5'],
                ['3.0', '3'],
                ['-.5', '-0.5'],
                ['-0.0', '0'],
                ['5.', '5'],
                ['000', '0'],
            ]);
        });

        test('Rejects what is not a decimal', () => {
            expectInvalid(x.decimal(), ['.', '1e3', '', '1.2.3', 'INF']);
        });
    });

    suite('Floats', () => {
        test('Reads numbers, infinities and NaN', () => {
            expectValues(x.double(), [
                ['1.5e3', 1500],
                ['+.5', 0.5],
                ['-1E-2', -0.01],
                ['INF', Number.POSITIVE_INFINITY],
                ['+INF', Number.POSITIVE_INFINITY],
                ['-INF', Number.NEGATIVE_INFINITY],
                ['5.', 5],
            ]);
            expect(Number.isNaN(read(x.double(), 'NaN'))).to.equal(true);
        });

        test('Rounds a float to single precision', () => {
            expectValues(x.float(), [['0.1', Math.fround(0.1)]]);
        });

        test('Rejects what is not a float', () => {
            expectInvalid(x.double(), ['inf', '-NaN', '1e', '', 'Infinity']);
        });
    });

    suite('Boolean', () => {
        test('Reads true, false, 1 and 0', () => {
            expectValues(x.boolean(), [
                ['true', true],
                [' 1 ', true],
                ['false', false],
                ['0', false],
            ]);
            expectInvalid(x.boolean(), ['TRUE', 'yes', '']);
        });
    });

    suite('Dates and times', () => {
        test('Keeps valid dates and times as written', () => {
            expectValues(x.dateTime(), [
                ['2026-11-12T09:30:00Z', '2026-11-12T09:30:00Z'],
                ['-0001-01-01T24:00:00.000+14:00', '-0001-01-01T24:00:00.000+14:00'],
                ['0000-02-29T00:00:00', '0000-02-29T00:00:00'],
                ['2000-02-29T00:00:00.5-13:59', '2000-02-29T00:00:00.5-13:59'],
            ]);
            expectValues(x.date(), [['2026-04-30', '2026-04-30']]);
            expectValues(x.time(), [['23:59:59.999', '23:59:59.999']]);
            expectValues(x.gYear(), [['12026', '12026']]);
            expectValues(x.gYearMonth(), [['2026-11Z', '2026-11Z']]);
            expectValues(x.gMonth(), [['--11', '--11']]);
            expectValues(x.gMonthDay(), [['--02-29', '--02-29']]);
            expectValues(x.gDay(), [['---31', '---31']]);
        });

        test('Rejects invalid dates and times', () => {
            expectInvalid(x.dateTime(), [
                '2026-11-12',
                '2026-13-01T00:00:00',
                '1900-02-29T00:00:00',
                '2026-11-12T24:00:01',
                '2026-11-12T00:00:00+14:01',
                '02026-01-01T00:00:00',
            ]);
            expectInvalid(x.date(), ['2026-04-31', '2026-02-29', '26-01-01']);
            expectInvalid(x.time(), ['25:00:00', '00:60:00']);
            expectInvalid(x.gMonthDay(), ['--02-30']);
            expectInvalid(x.gDay(), ['--31']);
            expectInvalid(x.gMonth(), ['--13']);
            expectInvalid(x.gYear(), ['26']);
            expectInvalid(x.gYearMonth(), ['2026']);
        });

        test('Checks durations', () => {
            expectValues(x.duration(), [
                ['P1Y2M3DT4H5M6.7S', 'P1Y2M3DT4H5M6.7S'],
                ['-PT1M', '-PT1M'],
                ['P0D', 'P0D'],
            ]);
            expectInvalid(x.duration(), ['P', 'PT', 'P1DT', '1D', 'P1S', 'PT1.S']);
        });
    });

    suite('Binary', () => {
        test('Checks base64', () => {
            expectValues(x.base64Binary(), [
                ['aGk=', 'aGk='],
                [' aG k= ', 'aG k='],
                ['', ''],
                ['aGVsbG8h', 'aGVsbG8h'],
                ['aA==', 'aA=='],
            ]);
            expectInvalid(x.base64Binary(), ['aGk', 'aGl=', 'aB==', 'a===', '!!!!']);
        });

        test('Checks hex', () => {
            expectValues(x.hexBinary(), [
                ['0fA9', '0fA9'],
                ['', ''],
            ]);
            expectInvalid(x.hexBinary(), ['0', 'zz']);
        });
    });

    suite('QName', () => {
        test('Reads an unprefixed name in no namespace', () => {
            expectValues(x.qname(), [['a', { namespace: null, localName: 'a' }]]);
        });

        test('Rejects what is not a QName', () => {
            expectInvalid(x.qname(), [':a', 'a:', 'a:b:c', '1a']);
        });

        test('Resolves the xml prefix', () => {
            expectValues(x.qname(), [
                [
                    'xml:lang',
                    { namespace: 'http://www.w3.org/XML/1998/namespace', localName: 'lang' },
                ],
            ]);
        });
    });

    suite('Lists and unions', () => {
        test('A list splits on whitespace', () => {
            expectValues(x.list(x.int()), [
                [' 1 2\n3 ', [1, 2, 3]],
                ['  ', []],
            ]);
            expectInvalid(x.list(x.int()), ['1 a']);
        });

        test('A union takes the first member that accepts the text', () => {
            const type = x.union([x.int(), x.boolean(), x.token()]);
            expectValues(type, [
                ['1', 1],
                ['true', true],
                [' a  b ', 'a b'],
            ]);
        });

        test('A union rejects text no member accepts', () => {
            expectInvalid(
                x.union([x.int(), x.boolean()]),
                ['a'],
                /"a" is not valid for any member of the union/v
            );
        });

        test('A list of a union reads each item by the union', () => {
            expectValues(x.list(x.union([x.int(), x.token({ enumeration: ['none'] })])), [
                ['1 none', [1, 'none']],
            ]);
        });
    });
});
