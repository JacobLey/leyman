import type { XeneverInvalidSchemaError } from '#internal/lib/errors.js';
import type { AtomicKind, BigIntegerKind } from '#internal/lib/schema/ir.js';
import type { Builtin, Namespaces, Whitespace } from './builtins.js';
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
import { builtins, InvalidValueError, processWhitespace, whitespaceOrder } from './builtins.js';
import { compareDecimals, totalDigits } from './decimal.js';
import { compilePattern } from './regex.js';

/**
 * A simple type, ready to read text.
 */
export interface CompiledSimple {
    /**
     * Reads a text as the type's value.
     *
     * @param text - text as written (whitespace not yet processed)
     * @param namespaces - namespaces in scope, for `QName` values
     * @returns its value
     * @throws {InvalidValueError} when the text isn't valid for the type
     */
    readonly parse: (text: string, namespaces: Namespaces) => unknown;
    /**
     * Whether a value of the type may be a `QName`, which a value written in the schema (an enumeration or a
     * default) can't resolve.
     */
    readonly hasQName: boolean;
}

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
 * ([XSD 1.1 Part 2 §4.1.5](https://www.w3.org/TR/xmlschema11-2/#rf-facets)). Range facets on date and time
 * types need XSD's partial order across timezones; enumerations of dates, binary values, QNames, lists and
 * unions need equality in their value space, where a literal union of the written values would be unsound.
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
    date: { supported: ['pattern'], unsupported: [...rangeFacets, 'enumeration'] },
    binary: { supported: [...lengthFacets, 'pattern'], unsupported: ['enumeration'] },
    qname: { supported: ['pattern'], unsupported: [...lengthFacets, 'enumeration'] },
    list: { supported: [...lengthFacets, 'pattern'], unsupported: ['enumeration'] },
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
    return value === Number.NEGATIVE_INFINITY ? '-INF' : String(value);
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
    if (facets.minInclusive !== undefined && facets.minExclusive !== undefined) {
        invalidSchema("`minInclusive` can't be combined with `minExclusive`", facetsPath);
    }
    if (facets.maxInclusive !== undefined && facets.maxExclusive !== undefined) {
        invalidSchema("`maxInclusive` can't be combined with `maxExclusive`", facetsPath);
    }

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

    return {
        hasQName: kind === 'QName',
        parse: (text, namespaces) => {
            const read = readBuiltin(text, namespaces);
            checkPatterns(read.lexical);
            if (read.length !== undefined) {
                checkLength(read.length, length, read.lexical);
            }
            for (const { facet, limit, written } of ranges) {
                const comparison =
                    typeof limit === 'number'
                        ? (read.value as number) - limit
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
            return read.value;
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
    return {
        hasQName: item.hasQName,
        parse: (text, namespaces) => {
            const lexical = processWhitespace(text, 'collapse');
            checkPatterns(lexical);
            const items = lexical === '' ? [] : lexical.split(' ');
            checkLength(items.length, length, lexical);
            return items.map(itemText => item.parse(itemText, namespaces));
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
        parse: (text, namespaces) => {
            // A union has no whitespace processing of its own; its members each have theirs. Patterns are
            // matched against the collapsed text, as most members collapse it.
            const lexical = processWhitespace(text, 'collapse');
            checkPatterns(lexical);
            for (const member of members) {
                try {
                    return member.parse(text, namespaces);
                } catch {
                    // The next member may accept it.
                }
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
            compiled = compileAtomic(record, path);
        } else {
            return invalidSchema(`Unknown simple type kind ${JSON.stringify(record.kind)}`, path);
        }
        compiledSimple.set(record, compiled);
    }
    return compiled;
};
