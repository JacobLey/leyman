import type { x as X } from 'xenever';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import {
    parse,
    x,
    XeneverInvalidSchemaError,
    XeneverUnsupportedError,
    XeneverValidationError,
} from 'xenever';

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
 * Asserts a text is invalid for the type.
 *
 * @param type - schema value of the type
 * @param text - text as written
 * @param reason - matches the message
 */
const expectInvalid = (type: X.SimpleType, text: string, reason: RegExp): void => {
    expect(() => read(type, text)).to.throw(XeneverValidationError, reason);
};

/**
 * Asserts a type is an invalid schema value.
 *
 * @param type - schema value of the type
 * @param reason - matches the message
 * @param path - path to the invalid construct
 */
const expectInvalidSchema = (type: unknown, reason: RegExp, path: string): void => {
    expect(() => read(type as X.SimpleType, ''))
        .to.throw(XeneverInvalidSchemaError, reason)
        .that.includes({ path });
};

suite('Facets', () => {
    suite('Lengths', () => {
        test('Counts characters of strings, by code point', () => {
            expect(read(x.string({ length: 2 }), '😀a')).to.equal('😀a');
            expectInvalid(
                x.string({ length: 2 }),
                'abc',
                /"abc" has length 3, expected exactly 2/v
            );
            expectInvalid(x.string({ minLength: 2 }), 'a', /expected at least 2/v);
            expectInvalid(
                x.string({ minLength: 1, maxLength: 2 }),
                'abc',
                /expected between 1 and 2/v
            );
            expectInvalid(x.string({ maxLength: 2 }), 'abc', /expected between 0 and 2/v);
        });

        test('Counts length after whitespace processing', () => {
            expect(read(x.token({ maxLength: 1 }), '  a  ')).to.equal('a');
        });

        test('Counts octets of binary types', () => {
            expect(read(x.hexBinary({ length: 2 }), '0aff')).to.equal('0aff');
            expect(read(x.base64Binary({ length: 2 }), 'aGk=')).to.equal('aGk=');
            expect(read(x.base64Binary({ length: 1 }), 'aA==')).to.equal('aA==');
            expectInvalid(x.base64Binary({ maxLength: 2 }), 'aGVsbG8h', /has length 6/v);
        });

        test('Counts items of lists', () => {
            expect(read(x.list(x.int(), { minLength: 2 }), '1 2')).to.deep.equal([1, 2]);
            expectInvalid(x.list(x.int(), { minLength: 2 }), '1', /"1" has length 1/v);
        });
    });

    suite('Patterns', () => {
        test('Matches the whole value after whitespace processing', () => {
            expect(read(x.token({ pattern: '[a-z]+' }), ' abc ')).to.equal('abc');
            expectInvalid(
                x.token({ pattern: '[a-z]+' }),
                'abc1',
                /"abc1" does not match the pattern "\[a-z\]\+"/v
            );
        });

        test('Needs every pattern of an array to match', () => {
            const type = x.string({ pattern: ['[a-z]+', '.{3}'] });
            expect(read(type, 'abc')).to.equal('abc');
            expectInvalid(type, 'ab', /does not match the pattern "\.\{3\}"/v);
        });

        test('Checks the lexical form of numbers', () => {
            expect(read(x.int({ pattern: '0\\d' }), '07')).to.equal(7);
            expectInvalid(x.int({ pattern: '0\\d' }), '7', /does not match/v);
        });

        test('Checks lists and unions as written', () => {
            expectInvalid(x.list(x.int(), { pattern: '\\d' }), '1 2', /"1 2" does not match/v);
            expect(read(x.union([x.int()], { pattern: '\\d' }), ' 1 ')).to.equal(1);
            expectInvalid(x.union([x.int()], { pattern: '\\d' }), '12', /does not match/v);
        });
    });

    suite('Ranges', () => {
        test('Compares integers', () => {
            const type = x.int({ minInclusive: 1, maxExclusive: '10' });
            expect(read(type, '1')).to.equal(1);
            expectInvalid(type, '0', /"0" is outside `minInclusive` 1/v);
            expectInvalid(type, '10', /"10" is outside `maxExclusive` 10/v);
        });

        test('Compares decimals exactly', () => {
            const type = x.decimal({
                minExclusive: '0.1',
                maxInclusive: '100000000000000000000.5',
            });
            expect(read(type, '0.10000000000000000001')).to.equal('0.10000000000000000001');
            expect(read(type, '100000000000000000000.5')).to.equal('100000000000000000000.5');
            expectInvalid(type, '0.1', /outside `minExclusive` 0\.1/v);
            expectInvalid(type, '100000000000000000000.50001', /outside `maxInclusive`/v);
            expectInvalid(type, '-1', /outside `minExclusive`/v);
            expectInvalid(type, '1000000000000000000000', /outside `maxInclusive`/v);
        });

        test('Compares negative decimals', () => {
            const type = x.decimal({ minInclusive: -2.5, maxInclusive: '-1' });
            expect(read(type, '-2.5')).to.equal('-2.5');
            expectInvalid(type, '-2.51', /outside `minInclusive` -2\.5/v);
            expectInvalid(type, '-10', /outside `minInclusive`/v);
            expectInvalid(type, '-0.5', /outside `maxInclusive`/v);
            expectInvalid(type, '1', /outside `maxInclusive`/v);
        });

        test('Compares bigints', () => {
            const type = x.integer({ bigint: true, minInclusive: '9223372036854775808' });
            expect(read(type, '9223372036854775808')).to.equal(9_223_372_036_854_775_808n);
            expectInvalid(type, '9223372036854775807', /outside `minInclusive`/v);
        });

        test('Compares floats, NaN in no range', () => {
            const type = x.double({ minInclusive: 0, maxInclusive: 1 });
            expect(read(type, '0.5')).to.equal(0.5);
            expectInvalid(type, '2', /outside `maxInclusive` 1/v);
            expectInvalid(type, 'NaN', /outside `minInclusive` 0/v);
        });
    });

    suite('Digits', () => {
        test('Counts total digits of the value', () => {
            const type = x.decimal({ totalDigits: 4 });
            expect(read(type, '0012.3400')).to.equal('12.34');
            expect(read(type, '0.0012')).to.equal('0.0012');
            expectInvalid(type, '0.00012', /has more than `totalDigits` 4/v);
            expectInvalid(type, '12345', /has more than `totalDigits` 4/v);
        });

        test('Counts fraction digits of the value', () => {
            const type = x.decimal({ fractionDigits: 1 });
            expect(read(type, '1.50')).to.equal('1.5');
            expectInvalid(type, '1.55', /has more than `fractionDigits` 1/v);
        });

        test('Applies to integers', () => {
            expectInvalid(x.long({ totalDigits: 2 }), '100', /`totalDigits` 2/v);
        });
    });

    suite('Enumerations', () => {
        test('Accepts only the values listed', () => {
            const type = x.token({ enumeration: ['a b', 'c'] });
            expect(read(type, ' a   b ')).to.equal('a b');
            expectInvalid(type, 'd', /"d" is not one of the enumerated values/v);
        });

        test('Compares numbers by value', () => {
            expect(read(x.int({ enumeration: [1, 2] }), '+01')).to.equal(1);
            expect(read(x.integer({ bigint: true, enumeration: ['-5'] }), '-05')).to.equal(-5n);
            expect(read(x.decimal({ enumeration: ['1.5'] }), '1.50')).to.equal('1.5');
            expect(read(x.double({ enumeration: [0, Number.NaN] }), '-0')).to.equal(-0);
            expect(Number.isNaN(read(x.double({ enumeration: [Number.NaN] }), 'NaN'))).to.equal(
                true
            );
            expect(read(x.double({ enumeration: [Number.POSITIVE_INFINITY] }), 'INF')).to.equal(
                Number.POSITIVE_INFINITY
            );
            expect(
                read(x.float({ enumeration: [0.5, Number.NEGATIVE_INFINITY] }), '-INF')
            ).to.equal(Number.NEGATIVE_INFINITY);
        });
    });

    suite('Whitespace', () => {
        test('Makes a string type stricter', () => {
            expect(read(x.string({ whiteSpace: 'collapse' }), ' a  b ')).to.equal('a b');
            expect(read(x.string({ whiteSpace: 'replace' }), '\ta')).to.equal(' a');
            expect(read(x.token({ whiteSpace: 'collapse' }), ' a ')).to.equal('a');
        });
    });

    suite('Invalid facets', () => {
        test('Rejects a facet that does not apply to the type', () => {
            expectInvalidSchema(
                x.boolean({ length: 1 } as never),
                /The facet `length` doesn't apply/v,
                '/type/facets/length'
            );
        });

        test('Rejects an unknown facet', () => {
            expectInvalidSchema(
                { kind: 'string', facets: { maxlength: 1 } },
                /Unknown property `maxlength`/v,
                '/type/facets'
            );
        });

        test('Rejects facets that are not an object', () => {
            expectInvalidSchema(
                { kind: 'string', facets: [] },
                /Expected an object/v,
                '/type/facets'
            );
        });

        test('Rejects a facet xenever does not support', () => {
            for (const [type, facet] of [
                [{ kind: 'date', facets: { minInclusive: '2026-01-01' } }, 'minInclusive'],
                [{ kind: 'hexBinary', facets: { enumeration: ['00'] } }, 'enumeration'],
                [{ kind: 'QName', facets: { length: 1 } }, 'length'],
                [
                    { kind: 'list', item: { kind: 'int' }, facets: { enumeration: [] } },
                    'enumeration',
                ],
                [
                    { kind: 'union', members: [{ kind: 'int' }], facets: { enumeration: [] } },
                    'enumeration',
                ],
            ] as const) {
                expect(() => read(type as unknown as X.SimpleType, ''))
                    .to.throw(
                        XeneverUnsupportedError,
                        new RegExp(`\`${facet}\` is not supported`, 'v')
                    )
                    .that.includes({ path: `/type/facets/${facet}` });
            }
        });

        test('Rejects lengths that are not non-negative integers', () => {
            expectInvalidSchema(
                x.string({ length: -1 }),
                /Expected an integer of at least 0/v,
                '/type/facets/length'
            );
            expectInvalidSchema(
                x.string({ minLength: 1.5 }),
                /Expected an integer/v,
                '/type/facets/minLength'
            );
        });

        test('Rejects length with minLength or maxLength', () => {
            expectInvalidSchema(
                x.string({ length: 1, maxLength: 2 }),
                /`length` can't be combined/v,
                '/type/facets'
            );
        });

        test('Rejects minLength above maxLength', () => {
            expectInvalidSchema(
                x.string({ minLength: 3, maxLength: 2 }),
                /`minLength` is greater than `maxLength`/v,
                '/type/facets'
            );
        });

        test('Rejects both inclusive and exclusive bounds', () => {
            expectInvalidSchema(
                x.int({ minInclusive: 1, minExclusive: 0 }),
                /`minInclusive` can't be combined/v,
                '/type/facets'
            );
            expectInvalidSchema(
                x.int({ maxInclusive: 1, maxExclusive: 2 }),
                /`maxInclusive` can't be combined/v,
                '/type/facets'
            );
        });

        test('Rejects a bound outside the type', () => {
            expectInvalidSchema(
                x.byte({ maxInclusive: 1000 }),
                /"1000" is not a valid byte/v,
                '/type/facets/maxInclusive'
            );
            expectInvalidSchema(
                x.int({ minInclusive: 1.5 }),
                /"1\.5" is not a valid int/v,
                '/type/facets/minInclusive'
            );
        });

        test('Rejects a bound of the wrong type', () => {
            expectInvalidSchema(
                x.int({ minInclusive: true } as never),
                /Expected a number or string/v,
                '/type/facets/minInclusive'
            );
            expectInvalidSchema(
                x.double({ minInclusive: '1' } as never),
                /Expected a number/v,
                '/type/facets/minInclusive'
            );
        });

        test('Rejects totalDigits below 1 and fractionDigits above it', () => {
            expectInvalidSchema(
                x.decimal({ totalDigits: 0 }),
                /at least 1/v,
                '/type/facets/totalDigits'
            );
            expectInvalidSchema(
                x.decimal({ totalDigits: 1, fractionDigits: 2 }),
                /`fractionDigits` is greater/v,
                '/type/facets'
            );
        });

        test('Rejects a whiteSpace weaker than the type', () => {
            expectInvalidSchema(
                x.token({ whiteSpace: 'preserve' }),
                /`whiteSpace` must be one of `collapse`/v,
                '/type/facets/whiteSpace'
            );
            expectInvalidSchema(
                x.normalizedString({ whiteSpace: 'preserve' }),
                /must be one of `replace`, `collapse`/v,
                '/type/facets/whiteSpace'
            );
            expectInvalidSchema(
                x.string({ whiteSpace: 'trim' } as never),
                /must be one of `preserve`, `replace`, `collapse`/v,
                '/type/facets/whiteSpace'
            );
        });

        test('Rejects an enumeration value not in the form parsing returns', () => {
            expectInvalidSchema(
                x.token({ enumeration: [' a'] }),
                /" a" is not in the form parsing returns \("a"\)/v,
                '/type/facets/enumeration/0'
            );
            expectInvalidSchema(
                x.decimal({ enumeration: ['1.50'] }),
                /\("1\.5"\)/v,
                '/type/facets/enumeration/0'
            );
            expectInvalidSchema(
                x.long({ bigint: true, enumeration: ['+5' as '5'] }),
                /\("5"\)/v,
                '/type/facets/enumeration/0'
            );
            expectInvalidSchema(
                x.float({ enumeration: [0.1] }),
                /0\.1 is not in the form/v,
                '/type/facets/enumeration/0'
            );
        });

        test('Rejects an invalid enumeration value', () => {
            expectInvalidSchema(
                x.int({ enumeration: [1.5] }),
                /"1\.5" is not a valid int/v,
                '/type/facets/enumeration/0'
            );
            expectInvalidSchema(
                { kind: 'int', facets: { enumeration: 1 } },
                /Expected an array/v,
                '/type/facets/enumeration'
            );
        });

        test('Rejects a pattern that is not a string', () => {
            expectInvalidSchema(
                { kind: 'string', facets: { pattern: [1] } },
                /Expected a string/v,
                '/type/facets/pattern/0'
            );
            expectInvalidSchema(
                { kind: 'string', facets: { pattern: 1 } },
                /Expected an array/v,
                '/type/facets/pattern'
            );
        });

        test('Rejects bigint on a type that is always a number', () => {
            expectInvalidSchema(
                { kind: 'int', bigint: true },
                /Unknown property `bigint`/v,
                '/type'
            );
        });

        test('Rejects a bigint flag that is not a boolean', () => {
            expectInvalidSchema(
                { kind: 'integer', bigint: 1 },
                /Expected a boolean/v,
                '/type/bigint'
            );
        });
    });
});
