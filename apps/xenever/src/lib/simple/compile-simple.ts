import type { XeneverInvalidSchemaError } from '#internal/lib/errors.js';
import type { QNameValue } from '#internal/lib/schema/infer.js';
import type { AtomicKind, BigIntegerKind, DateKind } from '#internal/lib/schema/ir.js';
import type { Builtin, BuiltinValue, Namespaces, Whitespace } from './builtins.js';
import type { Decimal } from './decimal.js';
import { XeneverUnsupportedError } from '#internal/lib/errors.js';
import {
    checkArray,
    checkInteger,
    checkObject,
    childPath,
    invalidSchema,
    isFlagged,
} from '#internal/lib/schema/check.js';
import {
    builtins,
    integerBounds,
    InvalidValueError,
    processWhitespace,
    whitespaceOrder,
} from './builtins.js';
import {
    compareDateValues,
    compareDurationValues,
    dateIdentity,
    durationIdentity,
    readDateValue,
    readDurationValue,
} from './date-time.js';
import { canonicalDecimal, compareDecimals, readDecimal, totalDigits } from './decimal.js';
import { compilePattern } from './regex.js';

/**
 * Receives each `ID` and `IDREF` in a value once it is read: the value itself, the items of a list, or the
 * value of the union member that read it.
 */
export type IdCollector = (kind: 'ID' | 'IDREF', value: string) => void;

/**
 * A simple type, ready to read text.
 */
export interface CompiledSimple {
    /**
     * Reads a text as the type's value.
     *
     * @param text - text as written (whitespace not yet processed)
     * @param namespaces - namespaces in scope, for `QName` values
     * @param ids - receives the `ID`s and `IDREF`s of the value, once it is valid
     * @returns its value
     * @throws {InvalidValueError} when the text isn't valid for the type
     */
    readonly parse: (text: string, namespaces: Namespaces, ids?: IdCollector) => unknown;
    /**
     * Whether a value may hold an `ID` or `IDREF`: the type is one, restricts one, or is a list or union of
     * one.
     */
    readonly hasIds: boolean;
    /**
     * Whether two values the type read are equal in its value space: dates on the timeline, lists item by
     * item, others as {@link isSameValue}.
     */
    readonly isEqual: (a: unknown, b: unknown) => boolean;
    /**
     * Identifies the value of a valid text in the value space, for identity constraints: two texts get the same
     * identity exactly when their values are equal ([XSD 1.0 Part 2 §2.2.3](https://www.w3.org/TR/xmlschema-2/#equality)),
     * whatever types read them. Values whose primitive types differ are never equal (the string `1` and the
     * decimal `1`), while types derived from one primitive share its value space (the int `1` and the decimal
     * `1.0`).
     *
     * @param text - a text the type accepts, as written
     * @param namespaces - namespaces in scope, for `QName` values
     * @returns its identity
     */
    readonly identityKey: (text: string, namespaces: Namespaces) => string;
    /**
     * Whether a value of the type may be a `QName`, which a value written in the schema (an enumeration or a
     * default) can't resolve.
     */
    readonly hasQName: boolean;
    /**
     * Whether the type is `ID` or restricts it, so a value is unique in its document and no declaration may
     * give it a `default` or `fixed`.
     */
    readonly isId: boolean;
}

/**
 * Whether two values read from text are the same, for a `fixed` value: equal, or both `NaN` (identical in
 * XSD 1.1, [Part 2 §2.2.2](https://www.w3.org/TR/xmlschema11-2/#identity)), and lists item by item.
 *
 * @param a - one value
 * @param b - another
 * @returns whether they are the same
 */
const isSameValue = (a: unknown, b: unknown): boolean =>
    Array.isArray(a) && Array.isArray(b)
        ? a.length === b.length && a.every((item, index) => isSameValue(item, b[index]))
        : a === b || (Number.isNaN(a) && Number.isNaN(b));

/**
 * Families of built-in types, which take the same facets.
 */
type Family =
    | 'binary'
    | 'boolean'
    | 'date'
    | 'decimal'
    | 'float'
    | 'list'
    | 'qname'
    | 'string'
    | 'union';

/**
 * Family of each built-in type.
 */
const families: Readonly<Record<AtomicKind, Family>> = {
    string: 'string',
    normalizedString: 'string',
    token: 'string',
    language: 'string',
    NMTOKEN: 'string',
    Name: 'string',
    NCName: 'string',
    ID: 'string',
    IDREF: 'string',
    ENTITY: 'string',
    anyURI: 'string',
    integer: 'decimal',
    long: 'decimal',
    int: 'decimal',
    short: 'decimal',
    byte: 'decimal',
    unsignedLong: 'decimal',
    unsignedInt: 'decimal',
    unsignedShort: 'decimal',
    unsignedByte: 'decimal',
    nonNegativeInteger: 'decimal',
    positiveInteger: 'decimal',
    nonPositiveInteger: 'decimal',
    negativeInteger: 'decimal',
    decimal: 'decimal',
    float: 'float',
    double: 'float',
    boolean: 'boolean',
    dateTime: 'date',
    date: 'date',
    time: 'date',
    gYear: 'date',
    gYearMonth: 'date',
    gMonth: 'date',
    gMonthDay: 'date',
    gDay: 'date',
    duration: 'date',
    base64Binary: 'binary',
    hexBinary: 'binary',
    QName: 'qname',
};

/**
 * Identifies a value a built-in type read, for {@link CompiledSimple.identityKey}: by its primitive type, then its
 * value in that primitive's value space.
 *
 * @param kind - the built-in type that read it
 * @param read - what it read: the value, and the decimal of a decimal or integer type
 * @returns a text that is the same exactly for equal values
 */
const builtinIdentity = (kind: AtomicKind, read: BuiltinValue): string => {
    const family = families[kind];
    if (family === 'decimal') {
        return `decimal ${canonicalDecimal(read.decimal!)}`;
    }
    if (family === 'float') {
        // `float` and `double` are separate primitives. `String` writes -0 as `0`, which it equals.
        return `${kind} ${String(read.value)}`;
    }
    if (family === 'binary') {
        // Equal when the octets are: hex digits ignore case, and base64 may space its groups out.
        const text = read.value as string;
        return kind === 'hexBinary'
            ? `hexBinary ${text.toUpperCase()}`
            : `base64Binary ${atob(text)}`;
    }
    if (family === 'qname') {
        const { namespace, localName } = read.value as QNameValue;
        return `QName ${JSON.stringify([namespace, localName])}`;
    }
    // Booleans, and strings: `anyURI` is a primitive of its own, every other string type derives from `string`.
    return `${kind === 'anyURI' ? 'anyURI' : family} ${String(read.value)}`;
};

/**
 * Built-in types that take `bigint`.
 */
const bigIntegerKinds: ReadonlySet<string> = new Set<BigIntegerKind>([
    'integer',
    'long',
    'negativeInteger',
    'nonNegativeInteger',
    'nonPositiveInteger',
    'positiveInteger',
    'unsignedLong',
]);

const lengthFacets = ['length', 'minLength', 'maxLength'] as const;
const rangeFacets = ['minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive'] as const;
const digitsFacets = ['totalDigits', 'fractionDigits'] as const;

/**
 * Facets each family takes, and those XSD allows but xenever doesn't support yet
 * ([XSD 1.1 Part 2 §4.1.5](https://www.w3.org/TR/xmlschema11-2/#rf-facets)). Enumerations of binary values,
 * QNames and unions need equality in their value space, which xenever doesn't have for them: a binary value's
 * encoding, a QName's namespace or a union's member type.
 */
const familyFacets: Readonly<
    Record<
        Family,
        { readonly supported: readonly string[]; readonly unsupported: readonly string[] }
    >
> = {
    string: {
        supported: [...lengthFacets, 'pattern', 'enumeration', 'whiteSpace'],
        unsupported: [],
    },
    decimal: {
        supported: [...rangeFacets, ...digitsFacets, 'pattern', 'enumeration'],
        unsupported: [],
    },
    float: { supported: [...rangeFacets, 'pattern', 'enumeration'], unsupported: [] },
    boolean: { supported: ['pattern'], unsupported: [] },
    date: { supported: [...rangeFacets, 'pattern', 'enumeration'], unsupported: [] },
    binary: { supported: [...lengthFacets, 'pattern'], unsupported: ['enumeration'] },
    qname: { supported: ['pattern'], unsupported: [...lengthFacets, 'enumeration'] },
    list: { supported: [...lengthFacets, 'pattern', 'enumeration'], unsupported: [] },
    union: { supported: ['pattern'], unsupported: ['enumeration'] },
};

/**
 * Every facet name, to tell a facet a type doesn't take from a misspelling.
 */
const allFacets: ReadonlySet<string> = new Set([
    ...lengthFacets,
    ...rangeFacets,
    ...digitsFacets,
    'pattern',
    'enumeration',
    'whiteSpace',
]);

/**
 * Reads and checks the facets of a type.
 *
 * @param value - the `facets` property
 * @param family - family of the type
 * @param path - path to the type
 * @returns them by name
 * @throws {XeneverInvalidSchemaError} when a facet doesn't apply to the type
 * @throws {XeneverUnsupportedError} when a facet applies but isn't supported
 */
const readFacets = (
    value: unknown,
    family: Family,
    path: string
): Readonly<Record<string, unknown>> => {
    if (value === undefined) {
        return {};
    }
    const facetsPath = childPath(path, 'facets');
    const { supported, unsupported } = familyFacets[family];
    const facets = checkObject(value, [...allFacets], facetsPath);
    for (const facet of Object.keys(facets)) {
        if (unsupported.includes(facet)) {
            throw new XeneverUnsupportedError(
                `The facet \`${facet}\` is not supported on this type`,
                { path: childPath(facetsPath, facet) }
            );
        }
        if (!supported.includes(facet)) {
            invalidSchema(
                `The facet \`${facet}\` doesn't apply to this type`,
                childPath(facetsPath, facet)
            );
        }
    }
    return facets;
};

/**
 * Compiles the `pattern` facet.
 *
 * @param value - the facet
 * @param path - path to the facets
 * @returns a check that every pattern matches a lexical form
 */
const compilePatterns = (value: unknown, path: string): ((lexical: string) => void) => {
    if (value === undefined) {
        return () => {};
    }
    const patternPath = childPath(path, 'pattern');
    const sources = typeof value === 'string' ? [value] : checkArray(value, patternPath);
    const patterns = sources.map((source, index) => {
        const itemPath = typeof value === 'string' ? patternPath : childPath(patternPath, index);
        return typeof source === 'string'
            ? { pattern: source, regExp: compilePattern(source, itemPath) }
            : invalidSchema('Expected a string', itemPath);
    });
    return lexical => {
        for (const { pattern, regExp } of patterns) {
            if (!regExp.test(lexical)) {
                throw new InvalidValueError(
                    `${JSON.stringify(lexical)} does not match the pattern ${JSON.stringify(pattern)}`
                );
            }
        }
    };
};

/**
 * Checks of a value against facets on its length.
 */
interface LengthCheck {
    readonly min: number;
    readonly max: number;
}

/**
 * Compiles length facets.
 *
 * @param facets - the type's facets
 * @param path - path to the facets
 * @returns the allowed lengths
 */
const compileLength = (facets: Readonly<Record<string, unknown>>, path: string): LengthCheck => {
    const length = checkInteger(facets.length, childPath(path, 'length'));
    const minLength = checkInteger(facets.minLength, childPath(path, 'minLength'));
    const maxLength = checkInteger(facets.maxLength, childPath(path, 'maxLength'));
    if (length !== undefined && (minLength !== undefined || maxLength !== undefined)) {
        invalidSchema("`length` can't be combined with `minLength` or `maxLength`", path);
    }
    if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
        invalidSchema('`minLength` is greater than `maxLength`', path);
    }
    return {
        min: length ?? minLength ?? 0,
        max: length ?? maxLength ?? Number.POSITIVE_INFINITY,
    };
};

/**
 * Checks a value's length against its facets.
 *
 * @param length - the value's length
 * @param check - allowed lengths
 * @param text - the value, for the error
 * @throws {InvalidValueError} when the length isn't allowed
 */
const checkLength = (length: number, check: LengthCheck, text: string): void => {
    if (!(length < check.min || length > check.max)) {
        return;
    }

    let allowed = `between ${check.min} and ${check.max}`;
    if (check.min === check.max) {
        allowed = `exactly ${check.min}`;
    } else if (check.max === Number.POSITIVE_INFINITY) {
        allowed = `at least ${check.min}`;
    }
    throw new InvalidValueError(
        `${JSON.stringify(text)} has length ${length}, expected ${allowed}`
    );
};

/**
 * A range facet compared in a family's value space.
 *
 * @template Value - a value in the family's value space
 */
interface RangeCheck<Value> {
    readonly facet: (typeof rangeFacets)[number];
    readonly limit: Value;
    readonly written: string;
}

/**
 * For each range facet, whether a value compared to its limit satisfies it.
 */
const rangeComparisons: Readonly<
    Record<(typeof rangeFacets)[number], (comparison: number) => boolean>
> = {
    minInclusive: comparison => comparison >= 0,
    maxInclusive: comparison => comparison <= 0,
    minExclusive: comparison => comparison > 0,
    maxExclusive: comparison => comparison < 0,
};

/**
 * Whether a comparison result satisfies a range facet.
 *
 * @param facet - which range facet
 * @param comparison - value compared to the limit: negative, zero or positive
 * @returns whether the value is in range
 */
const isInRange = (facet: (typeof rangeFacets)[number], comparison: number): boolean =>
    rangeComparisons[facet](comparison);

/**
 * Compares two numbers of a float type's value space: `INF` equals itself (where subtracting gives `NaN`), and
 * `NaN` is neither smaller, equal nor larger than anything.
 *
 * @param a - one number
 * @param b - another
 * @returns negative, zero or positive as `a` is smaller, equal or larger; `NaN` when unordered
 */
const compareNumbers = (a: number, b: number): number => {
    if (a === b) {
        return 0;
    }
    if (a < b) {
        return -1;
    }
    return a > b ? 1 : Number.NaN;
};

/**
 * Lower and upper bounds that must be in order, and whether they may be equal
 * ([XSD 1.1 Part 2 §4.3.7–4.3.10](https://www.w3.org/TR/xmlschema11-2/#rf-maxInclusive), the
 * `…-less-than-…` constraints). Inclusive and exclusive bounds of one side never meet: they can't be combined.
 */
const rangeOrders: readonly {
    readonly lower: (typeof rangeFacets)[number];
    readonly upper: (typeof rangeFacets)[number];
    readonly mayEqual: boolean;
}[] = [
    { lower: 'minInclusive', upper: 'maxInclusive', mayEqual: true },
    { lower: 'minExclusive', upper: 'maxExclusive', mayEqual: true },
    { lower: 'minExclusive', upper: 'maxInclusive', mayEqual: false },
    { lower: 'minInclusive', upper: 'maxExclusive', mayEqual: false },
];

/**
 * Checks the range facets of a type leave its bounds in order. A type whose lower bound is above its upper bound
 * accepts nothing, which XSD rejects as an invalid schema rather than reading as an empty type.
 *
 * @param ranges - the range facets, read in the type's value space
 * @param path - path to the facets
 * @throws {XeneverInvalidSchemaError} when a lower bound is above an upper bound (or equal, where one is
 * exclusive), or either is `NaN`, which is not ordered
 */
const checkRangeOrder = (ranges: readonly RangeCheck<number | Decimal>[], path: string): void => {
    for (const { lower, upper, mayEqual } of rangeOrders) {
        const min = ranges.find(range => range.facet === lower);
        const max = ranges.find(range => range.facet === upper);
        if (!min || !max) {
            continue;
        }
        const comparison =
            typeof min.limit === 'number'
                ? compareNumbers(min.limit, max.limit as number)
                : compareDecimals(min.limit, max.limit as Decimal);
        // NaN compares as neither smaller nor larger, so is never in order.
        if (!(mayEqual ? comparison <= 0 : comparison < 0)) {
            invalidSchema(
                `\`${lower}\` ${min.written} must be ${mayEqual ? 'at most' : 'less than'} \`${upper}\` ${max.written}`,
                path
            );
        }
    }
};

/**
 * Lexical form of a number written in the schema.
 *
 * @param value - number written in the schema
 * @returns how XSD writes it
 */
const numberLexical = (value: number): string => {
    if (Number.isNaN(value)) {
        return 'NaN';
    }
    if (value === Number.POSITIVE_INFINITY) {
        return 'INF';
    }
    if (value === Number.NEGATIVE_INFINITY) {
        return '-INF';
    }
    // `String(-0)` is `'0'`, which reads back as positive zero, a different float value.
    return Object.is(value, -0) ? '-0' : String(value);
};

/**
 * Compiles an atomic type.
 *
 * @param type - schema value of the type
 * @param path - path to it
 * @returns its compiled form
 */
const compileAtomic = (type: Readonly<Record<string, unknown>>, path: string): CompiledSimple => {
    const kind = type.kind as AtomicKind;
    const builtin: Builtin = builtins[kind];
    const family = families[kind];
    checkObject(
        type,
        bigIntegerKinds.has(kind) ? ['kind', 'facets', 'bigint'] : ['kind', 'facets'],
        path
    );
    const isBigint = isFlagged(type.bigint, childPath(path, 'bigint'));
    const facetsPath = childPath(path, 'facets');
    const facets = readFacets(type.facets, family, path);

    let whitespace: Whitespace = builtin.whitespace;
    if (facets.whiteSpace !== undefined) {
        const restricted = facets.whiteSpace as Whitespace;
        if (
            !Object.hasOwn(whitespaceOrder, restricted) ||
            whitespaceOrder[restricted] < whitespaceOrder[whitespace]
        ) {
            invalidSchema(
                `\`whiteSpace\` must be one of ${Object.keys(whitespaceOrder)
                    .filter(
                        option =>
                            whitespaceOrder[option as Whitespace] >= whitespaceOrder[whitespace]
                    )
                    .map(option => `\`${option}\``)
                    .join(', ')}`,
                childPath(facetsPath, 'whiteSpace')
            );
        }
        whitespace = restricted;
    }

    /**
     * Reads a text with the built-in type alone, without facets.
     *
     * @param text - text as written
     * @param namespaces - namespaces in scope
     * @returns the processed text and its value
     */
    const readBuiltin = (
        text: string,
        namespaces: Namespaces
    ): ReturnType<Builtin['read']> & { lexical: string } => {
        const lexical = processWhitespace(text, whitespace);
        return { ...builtin.read(lexical, namespaces, isBigint), lexical };
    };

    /**
     * Reads a value written in the schema, as `facet`.
     *
     * @param value - value as written in the schema
     * @param facetPath - path to it
     * @returns its value
     */
    const readSchemaValue = (value: unknown, facetPath: string): ReturnType<typeof readBuiltin> => {
        const text = typeof value === 'number' ? numberLexical(value) : value;
        if (typeof text !== 'string' || (family === 'float' && typeof value !== 'number')) {
            return invalidSchema(
                `Expected a ${family === 'float' ? 'number' : 'number or string'}`,
                facetPath
            );
        }
        try {
            return readBuiltin(text, new Map());
        } catch (error) {
            return invalidSchema((error as InvalidValueError).message, facetPath);
        }
    };

    const checkPatterns = compilePatterns(facets.pattern, facetsPath);
    const length = compileLength(facets, facetsPath);

    const ranges: RangeCheck<number | Decimal>[] = [];
    for (const facet of rangeFacets) {
        if (facets[facet] === undefined) {
            continue;
        }

        const read = readSchemaValue(facets[facet], childPath(facetsPath, facet));
        ranges.push({
            facet,
            limit: read.decimal ?? (read.value as number),
            written: read.lexical,
        });
    }
    // An integer type's own bounds are its base's `minInclusive` and `maxInclusive`, which a bound of the
    // other side must still be in order with: `maxExclusive="1"` leaves `xs:positiveInteger` no values.
    const [builtinMin, builtinMax] = integerBounds[kind] ?? [null, null];
    for (const [facet, bound, side] of [
        ['minInclusive', builtinMin, ['minInclusive', 'minExclusive']],
        ['maxInclusive', builtinMax, ['maxInclusive', 'maxExclusive']],
    ] as const) {
        if (bound !== null && side.every(name => facets[name] === undefined)) {
            ranges.push({
                facet,
                limit: readDecimal(String(bound))!,
                written: `${bound} (of \`${kind}\`)`,
            });
        }
    }
    if (facets.minInclusive !== undefined && facets.minExclusive !== undefined) {
        invalidSchema("`minInclusive` can't be combined with `minExclusive`", facetsPath);
    }
    if (facets.maxInclusive !== undefined && facets.maxExclusive !== undefined) {
        invalidSchema("`maxInclusive` can't be combined with `maxExclusive`", facetsPath);
    }
    checkRangeOrder(ranges, facetsPath);

    const totalDigitsFacet = checkInteger(
        facets.totalDigits,
        childPath(facetsPath, 'totalDigits'),
        1
    );
    const fractionDigitsFacet = checkInteger(
        facets.fractionDigits,
        childPath(facetsPath, 'fractionDigits')
    );
    if (
        totalDigitsFacet !== undefined &&
        fractionDigitsFacet !== undefined &&
        fractionDigitsFacet > totalDigitsFacet
    ) {
        invalidSchema('`fractionDigits` is greater than `totalDigits`', facetsPath);
    }

    let enumeration: ReadonlySet<unknown> | null = null;
    if (facets.enumeration !== undefined) {
        const enumerationPath = childPath(facetsPath, 'enumeration');
        enumeration = new Set(
            checkArray(facets.enumeration, enumerationPath).map((value, index) => {
                const valuePath = childPath(enumerationPath, index);
                const parsed = readSchemaValue(value, valuePath).value;
                // A literal union of the written values is only sound when each is what parsing it returns.
                const isSame =
                    typeof parsed === 'bigint'
                        ? String(parsed) === value
                        : Object.is(parsed, value);
                if (!isSame) {
                    const form =
                        typeof parsed === 'bigint' ? `"${parsed}"` : JSON.stringify(parsed);
                    invalidSchema(
                        `Enumeration value ${JSON.stringify(value)} is not in the form parsing returns (${form})`,
                        valuePath
                    );
                }
                return parsed;
            })
        );
    }

    const idKind = kind === 'ID' || kind === 'IDREF' ? kind : null;
    return {
        hasQName: kind === 'QName',
        isId: kind === 'ID',
        hasIds: idKind !== null,
        isEqual: isSameValue,
        identityKey: (text, namespaces) => builtinIdentity(kind, readBuiltin(text, namespaces)),
        parse: (text, namespaces, ids) => {
            const read = readBuiltin(text, namespaces);
            checkPatterns(read.lexical);
            if (read.length !== undefined) {
                checkLength(read.length, length, read.lexical);
            }
            for (const { facet, limit, written } of ranges) {
                const comparison =
                    typeof limit === 'number'
                        ? compareNumbers(read.value as number, limit)
                        : compareDecimals(read.decimal!, limit);
                // NaN compares as neither smaller nor larger, so fails every range facet.
                if (!isInRange(facet, comparison)) {
                    throw new InvalidValueError(
                        `${JSON.stringify(read.lexical)} is outside \`${facet}\` ${written}`
                    );
                }
            }
            if (totalDigitsFacet !== undefined && totalDigits(read.decimal!) > totalDigitsFacet) {
                throw new InvalidValueError(
                    `${JSON.stringify(read.lexical)} has more than \`totalDigits\` ${totalDigitsFacet}`
                );
            }
            if (
                fractionDigitsFacet !== undefined &&
                read.decimal!.fraction.length > fractionDigitsFacet
            ) {
                throw new InvalidValueError(
                    `${JSON.stringify(read.lexical)} has more than \`fractionDigits\` ${fractionDigitsFacet}`
                );
            }
            if (enumeration && !enumeration.has(read.value)) {
                throw new InvalidValueError(
                    `${JSON.stringify(read.lexical)} is not one of the enumerated values`
                );
            }
            if (idKind !== null) {
                ids?.(idKind, read.value as string);
            }
            return read.value;
        },
    };
};

/**
 * Compiles a date, time or duration type. Values stay as written (whitespace collapsed); range facets and
 * enumerations compare them in XSD's partial order, where a value with a timezone and one without, or two
 * durations like `P1M` and `P30D`, may be neither smaller, equal nor larger: such a value is outside a range
 * facet, and matches no enumeration value. Facet values are lexical forms.
 *
 * @param type - schema value of the type
 * @param path - path to it
 * @returns its compiled form
 */
const compileDate = (type: Readonly<Record<string, unknown>>, path: string): CompiledSimple => {
    checkObject(type, ['kind', 'facets'], path);
    const kind = type.kind as DateKind;
    const facetsPath = childPath(path, 'facets');
    const facets = readFacets(type.facets, 'date', path);
    const order: {
        readonly read: (lexical: string) => unknown;
        readonly compare: (a: never, b: never) => number;
    } =
        kind === 'duration'
            ? { read: readDurationValue, compare: compareDurationValues }
            : { read: lexical => readDateValue(kind, lexical), compare: compareDateValues };
    const compare = order.compare as (a: unknown, b: unknown) => number;

    /**
     * Reads a text's lexical form, checked for the type.
     *
     * @param text - text as written
     * @returns the lexical form, whitespace collapsed
     */
    const readLexical = (text: string): string => {
        const lexical = processWhitespace(text, 'collapse');
        builtins[kind].read(lexical, new Map(), false);
        return lexical;
    };

    /**
     * Reads a facet value.
     *
     * @param value - value as written in the schema
     * @param facetPath - path to it
     * @returns its lexical form and value
     */
    const readSchemaValue = (
        value: unknown,
        facetPath: string
    ): { readonly lexical: string; readonly value: unknown } => {
        if (typeof value !== 'string') {
            return invalidSchema('Expected a string', facetPath);
        }
        let lexical: string;
        try {
            lexical = readLexical(value);
        } catch (error) {
            return invalidSchema((error as InvalidValueError).message, facetPath);
        }
        return { lexical, value: order.read(lexical) };
    };

    const checkPatterns = compilePatterns(facets.pattern, facetsPath);
    if (facets.minInclusive !== undefined && facets.minExclusive !== undefined) {
        invalidSchema("`minInclusive` can't be combined with `minExclusive`", facetsPath);
    }
    if (facets.maxInclusive !== undefined && facets.maxExclusive !== undefined) {
        invalidSchema("`maxInclusive` can't be combined with `maxExclusive`", facetsPath);
    }
    const ranges = rangeFacets
        .filter(facet => facets[facet] !== undefined)
        .map(facet => {
            const read = readSchemaValue(facets[facet], childPath(facetsPath, facet));
            return { facet, limit: read.value, written: JSON.stringify(read.lexical) };
        });
    for (const { lower, upper, mayEqual } of rangeOrders) {
        const min = ranges.find(range => range.facet === lower);
        const max = ranges.find(range => range.facet === upper);
        if (!min || !max) {
            continue;
        }
        // Only a lower bound above the upper one is an error: bounds the order can't compare are allowed
        // ([XSD 1.0 Part 2 §4.3.10.4](https://www.w3.org/TR/xmlschema-2/#minInclusive-coss)).
        const comparison = compare(min.limit, max.limit);
        if (mayEqual ? comparison > 0 : comparison >= 0) {
            invalidSchema(
                `\`${lower}\` ${min.written} must be ${mayEqual ? 'at most' : 'less than'} \`${upper}\` ${max.written}`,
                facetsPath
            );
        }
    }
    let enumeration: readonly unknown[] | null = null;
    if (facets.enumeration !== undefined) {
        const enumerationPath = childPath(facetsPath, 'enumeration');
        enumeration = checkArray(facets.enumeration, enumerationPath).map(
            (value, index) => readSchemaValue(value, childPath(enumerationPath, index)).value
        );
    }

    return {
        hasQName: false,
        isId: false,
        hasIds: false,
        isEqual: (a, b) => compare(order.read(a as string), order.read(b as string)) === 0,
        identityKey: text => {
            const lexical = processWhitespace(text, 'collapse');
            return `${kind} ${kind === 'duration' ? durationIdentity(lexical) : dateIdentity(kind, lexical)}`;
        },
        parse: text => {
            const lexical = readLexical(text);
            checkPatterns(lexical);
            const value = order.read(lexical);
            for (const { facet, limit, written } of ranges) {
                // An indeterminate comparison is NaN, which fails every range facet.
                if (!isInRange(facet, compare(value, limit))) {
                    throw new InvalidValueError(
                        `${JSON.stringify(lexical)} is outside \`${facet}\` ${written}`
                    );
                }
            }
            if (enumeration?.every(allowed => compare(value, allowed) !== 0) === true) {
                throw new InvalidValueError(
                    `${JSON.stringify(lexical)} is not one of the enumerated values`
                );
            }
            return lexical;
        },
    };
};

/**
 * Whether a simple type is a list, or a union with a list among its members (at any depth).
 *
 * @param type - schema value of the type
 * @returns whether it is or contains a list
 */
const isOrContainsList = (type: unknown): boolean => {
    const record = type as { readonly kind?: unknown; readonly members?: unknown } | null;
    return (
        record?.kind === 'list' ||
        (record?.kind === 'union' &&
            Array.isArray(record.members) &&
            record.members.some(member => isOrContainsList(member)))
    );
};

/**
 * Compiles a list type.
 *
 * @param type - schema value of the type
 * @param path - path to it
 * @returns its compiled form
 * @throws {XeneverUnsupportedError} for an enumeration of a list of binary values, QNames or unions
 */
const compileList = (type: Readonly<Record<string, unknown>>, path: string): CompiledSimple => {
    checkObject(type, ['kind', 'item', 'facets'], path);
    const itemPath = childPath(path, 'item');
    if (isOrContainsList(type.item)) {
        invalidSchema('A list item type must not be or contain a list', itemPath);
    }
    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- `compileSimple` and this function call each other
    const item = compileSimple(type.item, itemPath);
    const facetsPath = childPath(path, 'facets');
    const facets = readFacets(type.facets, 'list', path);
    const checkPatterns = compilePatterns(facets.pattern, facetsPath);
    const length = compileLength(facets, facetsPath);
    const isEqual = (a: unknown, b: unknown): boolean => {
        const itemsA = a as readonly unknown[];
        const itemsB = b as readonly unknown[];
        return (
            itemsA.length === itemsB.length &&
            itemsA.every((value, index) => item.isEqual(value, itemsB[index]))
        );
    };

    /**
     * Reads a list without its enumeration.
     *
     * @param text - text as written
     * @param namespaces - namespaces in scope
     * @param ids - receives its `ID`s and `IDREF`s
     * @returns its lexical form, whitespace collapsed, and its items
     * @throws {InvalidValueError} when the text is not a valid list
     */
    const read = (
        text: string,
        namespaces: Namespaces,
        ids?: IdCollector
    ): { readonly lexical: string; readonly items: readonly unknown[] } => {
        const lexical = processWhitespace(text, 'collapse');
        checkPatterns(lexical);
        const texts = lexical === '' ? [] : lexical.split(' ');
        checkLength(texts.length, length, lexical);
        // An item past an invalid one never reaches `ids`, but the error ends the document anyway.
        return { lexical, items: texts.map(itemText => item.parse(itemText, namespaces, ids)) };
    };

    let enumeration: readonly (readonly unknown[])[] | null = null;
    if (facets.enumeration !== undefined) {
        const enumerationPath = childPath(facetsPath, 'enumeration');
        const itemKind = (type.item as { readonly kind?: unknown }).kind;
        // Equality of their items' values isn't known: see `familyFacets`.
        if (
            itemKind === 'union' ||
            ['binary', 'qname'].includes(families[itemKind as AtomicKind])
        ) {
            throw new XeneverUnsupportedError(
                'The facet `enumeration` is not supported on this type: a list of binary values, QNames or unions',
                { path: enumerationPath }
            );
        }
        enumeration = checkArray(facets.enumeration, enumerationPath).map((value, index) => {
            const valuePath = childPath(enumerationPath, index);
            if (typeof value !== 'string') {
                return invalidSchema('Expected a string', valuePath);
            }
            try {
                return read(value, new Map()).items;
            } catch (error) {
                return invalidSchema((error as InvalidValueError).message, valuePath);
            }
        });
    }
    return {
        isEqual,
        // A list equals only a list, item by item.
        identityKey: (text, namespaces) => {
            const lexical = processWhitespace(text, 'collapse');
            const texts = lexical === '' ? [] : lexical.split(' ');
            return `list ${JSON.stringify(texts.map(itemText => item.identityKey(itemText, namespaces)))}`;
        },
        hasQName: item.hasQName,
        isId: false,
        hasIds: item.hasIds,
        parse: (text, namespaces, ids) => {
            const { lexical, items } = read(text, namespaces, ids);
            if (enumeration?.every(allowed => !isEqual(items, allowed)) === true) {
                throw new InvalidValueError(
                    `${JSON.stringify(lexical)} is not one of the enumerated values`
                );
            }
            return items;
        },
    };
};

/**
 * Compiles a union type.
 *
 * @param type - schema value of the type
 * @param path - path to it
 * @returns its compiled form
 */
const compileUnion = (type: Readonly<Record<string, unknown>>, path: string): CompiledSimple => {
    checkObject(type, ['kind', 'members', 'facets'], path);
    const membersPath = childPath(path, 'members');
    const members = checkArray(type.members, membersPath).map((member, index) =>
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- `compileSimple` and this function call each other
        compileSimple(member, childPath(membersPath, index))
    );
    if (members.length === 0) {
        invalidSchema('A union needs at least one member', membersPath);
    }
    const facets = readFacets(type.facets, 'union', path);
    const checkPatterns = compilePatterns(facets.pattern, childPath(path, 'facets'));
    return {
        hasQName: members.some(member => member.hasQName),
        // A union of `ID` doesn't restrict it.
        isId: false,
        hasIds: members.some(member => member.hasIds),
        // The value doesn't say which member read it, so values compare as they are.
        isEqual: isSameValue,
        // The text has the value of the first member that accepts it, in that member's value space.
        identityKey: (text, namespaces) =>
            members
                .find(member => {
                    try {
                        member.parse(text, namespaces);
                        return true;
                    } catch {
                        return false;
                    }
                })!
                .identityKey(text, namespaces),
        parse: (text, namespaces, ids) => {
            // A union has no whitespace processing of its own; its members each have theirs. Patterns are
            // matched against the collapsed text, as most members collapse it.
            const lexical = processWhitespace(text, 'collapse');
            checkPatterns(lexical);
            for (const member of members) {
                let value: unknown;
                try {
                    value = member.parse(text, namespaces);
                } catch {
                    // The next member may accept it.
                    continue;
                }
                // Read again for its IDs only once it is the member that reads the text, so a member that
                // fails halfway through a list reports none.
                if (ids && member.hasIds) {
                    member.parse(text, namespaces, ids);
                }
                return value;
            }
            throw new InvalidValueError(
                `${JSON.stringify(lexical)} is not valid for any member of the union`
            );
        },
    };
};

/**
 * Compiled simple types, by schema value.
 */
const compiledSimple = new WeakMap<object, CompiledSimple>();

/**
 * Checks and compiles a simple type of the schema value, once per type object. The first problem found
 * throws a {@link XeneverInvalidSchemaError} or {@link XeneverUnsupportedError} with its path in the
 * declaration.
 *
 * @param type - schema value of the type
 * @param path - path to it
 * @returns its compiled form
 * @throws {XeneverInvalidSchemaError} when the type is invalid
 * @throws {XeneverUnsupportedError} when it uses a facet xenever doesn't support
 */
export const compileSimple = (type: unknown, path: string): CompiledSimple => {
    const record = checkObject(type, ['kind', 'facets', 'bigint', 'item', 'members'], path);
    let compiled = compiledSimple.get(record);
    if (!compiled) {
        if (record.kind === 'list') {
            compiled = compileList(record, path);
        } else if (record.kind === 'union') {
            compiled = compileUnion(record, path);
        } else if (typeof record.kind === 'string' && Object.hasOwn(builtins, record.kind)) {
            compiled =
                families[record.kind as AtomicKind] === 'date'
                    ? compileDate(record, path)
                    : compileAtomic(record, path);
        } else {
            return invalidSchema(`Unknown simple type kind ${JSON.stringify(record.kind)}`, path);
        }
        compiledSimple.set(record, compiled);
    }
    return compiled;
};
