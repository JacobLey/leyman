import type { QNameValue } from '#internal/lib/schema/infer.js';
import type { AtomicKind } from '#internal/lib/schema/ir.js';
import type { Decimal } from './decimal.js';
import { canonicalDecimal, readDecimal } from './decimal.js';
import { namePattern, ncNamePattern, nmtokenPattern } from './names.js';

/**
 * A text doesn't match its simple type. Caught where the text is, to throw with its location.
 */
export class InvalidValueError extends Error {
    /**
     * @param message - what is wrong with the value
     * @param options - the cause, if any
     */
    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'InvalidValueError';
    }
}

/**
 * Whitespace processing ([XSD 1.1 Part 2 §4.3.6](https://www.w3.org/TR/xmlschema11-2/#rf-whitespace)).
 */
export type Whitespace = 'collapse' | 'preserve' | 'replace';

/**
 * How strict each whitespace processing is: a restriction may only make it stricter.
 */
export const whitespaceOrder: Readonly<Record<Whitespace, number>> = {
    preserve: 0,
    replace: 1,
    collapse: 2,
};

/**
 * Applies whitespace processing.
 *
 * @param text - text as read
 * @param whitespace - processing to apply
 * @returns the processed text
 */
export const processWhitespace = (text: string, whitespace: Whitespace): string => {
    if (whitespace === 'preserve') {
        return text;
    }
    const replaced = text.replaceAll(/[\t\n\r]/gv, ' ');
    return whitespace === 'replace' ? replaced : replaced.replaceAll(/ +/gv, ' ').trim();
};

/**
 * Namespaces in scope where a value is written: prefix to namespace name, the default namespace under `''`.
 */
export type Namespaces = ReadonlyMap<string, string>;

/**
 * The value of a built-in type, before facets.
 */
export interface BuiltinValue {
    /**
     * What `parse` returns.
     */
    readonly value: unknown;
    /**
     * The number, for decimal and integer types, which range and digit facets check.
     */
    readonly decimal?: Decimal;
    /**
     * Length as length facets count it: characters, or octets for binary types.
     */
    readonly length?: number;
}

/**
 * A built-in type: its whitespace processing, and how it reads a processed text.
 */
export interface Builtin {
    readonly whitespace: Whitespace;
    /**
     * Reads a text after whitespace processing.
     *
     * @throws {InvalidValueError} when the text isn't in the type's lexical space
     */
    readonly read: (text: string, namespaces: Namespaces, isBigint: boolean) => BuiltinValue;
}

/**
 * Throws that a text isn't a valid value of a type.
 *
 * @param text - text as written
 * @param kind - name of the built-in type
 * @throws {InvalidValueError} always
 */
const invalid = (text: string, kind: string): never => {
    throw new InvalidValueError(`${JSON.stringify(text)} is not a valid ${kind}`);
};

/**
 * A string type checked against a pattern, or any text.
 *
 * @param whitespace - the type's whitespace processing
 * @param kind - the type, for errors
 * @param pattern - its lexical space, when restricted
 * @returns its lexical rules
 */
const stringType = (whitespace: Whitespace, kind: string, pattern?: RegExp): Builtin => ({
    whitespace,
    read: text => {
        if (pattern && !pattern.test(text)) {
            invalid(text, kind);
        }
        // eslint-disable-next-line @typescript-eslint/no-misused-spread -- Lengths count characters, i.e. code points, as spreading does
        return { value: text, length: [...text].length };
    },
});

const bits64 = 64n;
const bits32 = 32n;
const bits16 = 16n;
const bits8 = 8n;

/**
 * Inclusive bounds of a signed integer of some bits.
 *
 * @param bits - its size
 * @returns its smallest and largest value
 */
const signed = (bits: bigint): readonly [bigint, bigint] => [
    -(2n ** (bits - 1n)),
    2n ** (bits - 1n) - 1n,
];

/**
 * Inclusive bounds of an unsigned integer of some bits.
 *
 * @param bits - its size
 * @returns its smallest and largest value
 */
const unsigned = (bits: bigint): readonly [bigint, bigint] => [0n, 2n ** bits - 1n];

/**
 * Upper bound of `negativeInteger`.
 */
const largestNegative = -1n;

/**
 * Inclusive bounds of each integer type ([XSD 1.1 Part 2 §3.4](https://www.w3.org/TR/xmlschema11-2/#built-in-derived)),
 * `null` for none.
 */
const integerBounds: Readonly<Record<string, readonly [min: bigint | null, max: bigint | null]>> = {
    integer: [null, null],
    long: signed(bits64),
    int: signed(bits32),
    short: signed(bits16),
    byte: signed(bits8),
    unsignedLong: unsigned(bits64),
    unsignedInt: unsigned(bits32),
    unsignedShort: unsigned(bits16),
    unsignedByte: unsigned(bits8),
    nonNegativeInteger: [0n, null],
    positiveInteger: [1n, null],
    nonPositiveInteger: [null, 0n],
    negativeInteger: [null, largestNegative],
};

/**
 * An integer type. As a `number` (unless `bigint`), a value outside the safe range is an error rather than a
 * silent loss of precision.
 *
 * @param kind - name of the built-in type
 * @returns its lexical rules
 */
const integerType = (kind: string): Builtin => {
    const [min, max] = integerBounds[kind]!;
    return {
        whitespace: 'collapse',
        read: (text, _namespaces, isBigint) => {
            const decimal = /^[+\-]?\d+$/v.test(text) ? readDecimal(text)! : invalid(text, kind);
            const value = BigInt(`${decimal.negative ? '-' : ''}${decimal.integer || '0'}`);
            if ((min !== null && value < min) || (max !== null && value > max)) {
                invalid(text, kind);
            }
            if (isBigint) {
                return { value, decimal };
            }
            if (
                value < BigInt(Number.MIN_SAFE_INTEGER) ||
                value > BigInt(Number.MAX_SAFE_INTEGER)
            ) {
                throw new InvalidValueError(
                    `${JSON.stringify(text)} is outside the safe integer range of a number; declare the type with \`bigint: true\``
                );
            }
            return { value: Number(value), decimal };
        },
    };
};

/**
 * The `float` and `double` lexical form of a finite number
 * ([XSD 1.1 Part 2 §3.3.5](https://www.w3.org/TR/xmlschema11-2/#double)); `INF`, `+INF`, `-INF` and `NaN`
 * are the others, which `Number()` doesn't parse as written.
 */
const floatNumber = /^[+\-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+\-]?\d+)?$/iv;

/**
 * A floating point type.
 *
 * @param kind - name of the built-in type
 * @param round - rounds a double to the type's precision
 * @returns its lexical rules
 */
const floatType = (kind: string, round: (value: number) => number): Builtin => ({
    whitespace: 'collapse',
    read: text => {
        switch (text) {
            case 'NaN': {
                return { value: Number.NaN };
            }
            case 'INF':
            case '+INF': {
                return { value: Number.POSITIVE_INFINITY };
            }
            case '-INF': {
                return { value: Number.NEGATIVE_INFINITY };
            }
            default: {
                return floatNumber.test(text)
                    ? { value: round(Number(text)) }
                    : invalid(text, kind);
            }
        }
    },
});

/**
 * Timezone of date and time types: `Z` or an offset up to 14 hours.
 */
const timezone = String.raw`(?:Z|[+\-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))?`;
/**
 * Year of date types: at least four digits, no leading zero beyond four, optionally negative. XSD 1.1 allows
 * year `0000` ([Part 2 §3.3.7](https://www.w3.org/TR/xmlschema11-2/#dateTime)).
 */
const year = String.raw`(?<year>-?(?:[1-9]\d{3,}|0\d{3}))`;
const month = '(?<month>0[1-9]|1[0-2])';
const day = String.raw`(?<day>0[1-9]|[12]\d|3[01])`;
const time = String.raw`(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?|24:00:00(?:\.0+)?)`;

const february = 2;
const april = 4;
const june = 6;
const september = 9;
const november = 11;
const shortMonths: ReadonlySet<number> = new Set([april, june, september, november]);
const shortMonthDays = 30;
const longMonthDays = 31;
const leapFebruaryDays = 29;
const gregorianCycle = 400n;
const century = 100n;
const leapCycle = 4n;

/**
 * Days in a month, February in a leap year: the proleptic Gregorian calendar, where year 0 is a leap year
 * ([XSD 1.1 Part 2 §D.3.2](https://www.w3.org/TR/xmlschema11-2/#f-daysInMonth)).
 *
 * @param yearText - year, or `undefined` when the type has none (any February may have 29 days)
 * @param monthText - month, 1-based
 * @returns the number of days
 */
const daysInMonth = (yearText: string | undefined, monthText: string): number => {
    const monthNumber = Number(monthText);
    if (monthNumber !== february) {
        return shortMonths.has(monthNumber) ? shortMonthDays : longMonthDays;
    }
    if (yearText === undefined) {
        return leapFebruaryDays;
    }
    const yearNumber = BigInt(yearText);
    const isLeap =
        yearNumber % gregorianCycle === 0n ||
        (yearNumber % leapCycle === 0n && yearNumber % century !== 0n);
    return isLeap ? leapFebruaryDays : leapFebruaryDays - 1;
};

/**
 * A date or time type, kept as written.
 *
 * @param kind - name of the built-in type
 * @param lexical - its lexical form, with named groups `year`, `month` and `day` where it has them
 * @returns its lexical rules
 */
const dateType = (kind: string, lexical: RegExp): Builtin => ({
    whitespace: 'collapse',
    read: text => {
        const groups = (lexical.exec(text) ?? invalid(text, kind)).groups ?? {};
        if (
            groups.day !== undefined &&
            Number(groups.day) > daysInMonth(groups.year, groups.month!)
        ) {
            invalid(text, kind);
        }
        return { value: text };
    },
});

/**
 * The `duration` lexical form ([XSD 1.1 Part 2 §3.3.6](https://www.w3.org/TR/xmlschema11-2/#duration)): at
 * least one field, and a `T` only before a time field.
 */
const durationDate = String.raw`(?:\d+Y)?(?:\d+M)?(?:\d+D)?`;
const durationTime = String.raw`(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?`;
const durationLexical = new RegExp(String.raw`^-?P(?=\d|T\d)${durationDate}${durationTime}$`, 'v');

/**
 * Characters of the `base64Binary` lexical form after removing spaces
 * ([XSD 1.1 Part 2 §3.3.16](https://www.w3.org/TR/xmlschema11-2/#base64Binary)), in groups of four.
 */
const base64Characters = /^[\d+\/A-Za-z]*(?:=|==)?$/v;

/**
 * The bits padding the last group must be zero, so only some characters may come before `=` or `==`.
 */
const invalidDoublePadding = /[^AQgw]==$/v;
const invalidSinglePadding = /[^048=AEIMQUYcgkosw]=$/v;
const base64GroupLength = 4;
const base64GroupOctets = 3;

/**
 * Reads base64, after removing spaces.
 *
 * @param encoded - text without spaces
 * @returns its length in octets, or `null` when it isn't base64
 */
const base64Octets = (encoded: string): number | null => {
    if (
        !base64Characters.test(encoded) ||
        encoded.length % base64GroupLength !== 0 ||
        invalidDoublePadding.test(encoded) ||
        invalidSinglePadding.test(encoded)
    ) {
        return null;
    }
    const equals = encoded.indexOf('=');
    const padding = equals === -1 ? 0 : encoded.length - equals;
    return (encoded.length / base64GroupLength) * base64GroupOctets - padding;
};

/**
 * Every built-in type.
 */
export const builtins: Readonly<Record<AtomicKind, Builtin>> = {
    string: stringType('preserve', 'string'),
    normalizedString: stringType('replace', 'normalizedString'),
    token: stringType('collapse', 'token'),
    language: stringType('collapse', 'language', /^[A-Za-z]{1,8}(?:-[\dA-Za-z]{1,8})*$/v),
    NMTOKEN: stringType('collapse', 'NMTOKEN', nmtokenPattern),
    Name: stringType('collapse', 'Name', namePattern),
    NCName: stringType('collapse', 'NCName', ncNamePattern),
    ID: stringType('collapse', 'ID', ncNamePattern),
    IDREF: stringType('collapse', 'IDREF', ncNamePattern),
    ENTITY: stringType('collapse', 'ENTITY', ncNamePattern),
    anyURI: stringType('collapse', 'anyURI'),
    integer: integerType('integer'),
    long: integerType('long'),
    int: integerType('int'),
    short: integerType('short'),
    byte: integerType('byte'),
    unsignedLong: integerType('unsignedLong'),
    unsignedInt: integerType('unsignedInt'),
    unsignedShort: integerType('unsignedShort'),
    unsignedByte: integerType('unsignedByte'),
    nonNegativeInteger: integerType('nonNegativeInteger'),
    positiveInteger: integerType('positiveInteger'),
    nonPositiveInteger: integerType('nonPositiveInteger'),
    negativeInteger: integerType('negativeInteger'),
    decimal: {
        whitespace: 'collapse',
        read: text => {
            const decimal = readDecimal(text) ?? invalid(text, 'decimal');
            return { value: canonicalDecimal(decimal), decimal };
        },
    },
    float: floatType('float', Math.fround),
    double: floatType('double', value => value),
    boolean: {
        whitespace: 'collapse',
        read: text => {
            if (text === 'true' || text === '1') {
                return { value: true };
            }
            if (text === 'false' || text === '0') {
                return { value: false };
            }
            return invalid(text, 'boolean');
        },
    },
    dateTime: dateType('dateTime', new RegExp(`^${year}-${month}-${day}T${time}${timezone}$`, 'v')),
    date: dateType('date', new RegExp(`^${year}-${month}-${day}${timezone}$`, 'v')),
    time: dateType('time', new RegExp(`^${time}${timezone}$`, 'v')),
    gYearMonth: dateType('gYearMonth', new RegExp(`^${year}-${month}${timezone}$`, 'v')),
    gYear: dateType('gYear', new RegExp(`^${year}${timezone}$`, 'v')),
    gMonthDay: dateType('gMonthDay', new RegExp(`^--${month}-${day}${timezone}$`, 'v')),
    gDay: dateType('gDay', new RegExp(`^---${day}${timezone}$`, 'v')),
    gMonth: dateType('gMonth', new RegExp(`^--${month}${timezone}$`, 'v')),
    duration: {
        whitespace: 'collapse',
        read: text => (durationLexical.test(text) ? { value: text } : invalid(text, 'duration')),
    },
    base64Binary: {
        whitespace: 'collapse',
        read: text => {
            const length = base64Octets(text.replaceAll(' ', ''));
            return length === null ? invalid(text, 'base64Binary') : { value: text, length };
        },
    },
    hexBinary: {
        whitespace: 'collapse',
        read: text =>
            /^(?:[\da-f]{2})*$/iv.test(text)
                ? { value: text, length: text.length / 2 }
                : invalid(text, 'hexBinary'),
    },
    QName: {
        whitespace: 'collapse',
        read: (text, namespaces) => {
            const colon = text.indexOf(':');
            const prefix = colon === -1 ? null : text.slice(0, colon);
            const localName = text.slice(colon + 1);
            if (
                (prefix !== null && !ncNamePattern.test(prefix)) ||
                !ncNamePattern.test(localName)
            ) {
                invalid(text, 'QName');
            }
            const namespace = namespaces.get(prefix ?? '');
            if (prefix !== null && namespace === undefined) {
                throw new InvalidValueError(
                    `The prefix of QName ${JSON.stringify(text)} is not declared`
                );
            }
            return { value: { namespace: namespace ?? null, localName } satisfies QNameValue };
        },
    },
};
