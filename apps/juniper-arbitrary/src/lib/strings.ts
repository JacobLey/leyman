import type { Branch } from './flatten.js';
import * as fc from 'fast-check';

// The years `toISOString()` writes with four digits, in milliseconds since the epoch
const minDate = -62_167_219_200_000;
const maxDate = 253_402_300_799_999;
const dateLength = 'YYYY-MM-DD'.length;
const timeOffset = 'YYYY-MM-DDT'.length;
const maxDurationDays = 999;
const maxHour = 23;
const maxMinute = 59;
const maxPointerAncestors = 99;

const isoDate = fc.integer({ min: minDate, max: maxDate }).map(timestamp => {
    // eslint-disable-next-line unicorn/prefer-temporal -- Temporal isn't in the Node versions this supports, and a timestamp parses the same everywhere
    const date = new Date(timestamp);
    return date.toISOString();
});

const pointerSegment = fc
    .string({ unit: 'binary' })
    .map(segment => segment.replaceAll('~', '~0').replaceAll('/', '~1'));
const jsonPointer = fc.array(pointerSegment).map(segments => segments.map(s => `/${s}`).join(''));

const uriReference = fc.oneof(fc.webUrl(), fc.webPath());

/**
 * Generators for the formats a plain string would practically never satisfy.
 * Any other format (`password`, `binary`, or one a validator doesn't know) accepts plain strings.
 */
const formatArbitraries: Readonly<Record<string, fc.Arbitrary<string> | undefined>> = {
    byte: fc.base64String(),
    date: isoDate.map(date => date.slice(0, dateLength)),
    'date-time': isoDate,
    duration: fc
        .tuple(
            fc.nat({ max: maxDurationDays }),
            fc.nat({ max: maxHour }),
            fc.nat({ max: maxMinute })
        )
        .map(([days, hours, minutes]) => `P${days}DT${hours}H${minutes}M`),
    email: fc.emailAddress(),
    hostname: fc.domain(),
    'idn-email': fc.emailAddress(),
    'idn-hostname': fc.domain(),
    ipv4: fc.ipV4(),
    ipv6: fc.ipV6(),
    iri: fc.webUrl(),
    'iri-reference': uriReference,
    'json-pointer': jsonPointer,
    regex: fc.constantFrom('', '.*', '^a+$', '[a-z]{2,4}', '(?:foo|bar)\\d'),
    'relative-json-pointer': fc
        .tuple(fc.nat({ max: maxPointerAncestors }), jsonPointer)
        .map(([up, pointer]) => `${up}${pointer}`),
    time: isoDate.map(date => date.slice(timeOffset)),
    uri: fc.webUrl(),
    'uri-reference': uriReference,
    'uri-template': fc.webUrl(),
    uuid: fc.uuid(),
};

/**
 * A string that holds a match of each pattern can be built by putting them one after another:
 * anchored at the start first, anchored at the end last. `startsWith()`, `contains()` and
 * `endsWith()` combine this way. A pattern this misreads, like `^a$` next to another, is rejected
 * by the validator rather than producing a wrong value.
 *
 * @param patterns - patterns a string must match
 * @returns source of a single pattern, whose matches try to match them all
 */
const combinePatterns = (patterns: readonly string[]): string => {
    const atStart = patterns.filter(pattern => pattern.startsWith('^'));
    const atEnd = patterns.filter(pattern => !pattern.startsWith('^') && pattern.endsWith('$'));
    const between = patterns.filter(pattern => !pattern.startsWith('^') && !pattern.endsWith('$'));
    return [...atStart, ...between, ...atEnd].map(pattern => `(?:${pattern})`).join('[\\s\\S]*');
};

const lookaroundStart = /^\(\?<?[!=]/v;

/**
 * Remove lookaround, which fast-check can't generate from. What remains accepts more than the
 * original, and is often close enough for the validator to find a match, as with the likes of
 * `^(?=.*\d)(?=.*[a-z]).{8,}$`.
 *
 * @param pattern - regular expression source
 * @returns source without its lookaround groups
 */
const stripLookaround = (pattern: string): string => {
    let result = '';
    let depth = 0;
    let index = 0;
    while (index < pattern.length) {
        const character = pattern[index]!;
        // Escapes are copied whole, since an escaped parenthesis opens or closes nothing
        const token = character === '\\' ? pattern.slice(index, index + 2) : character;
        if (depth === 0 && lookaroundStart.test(pattern.slice(index))) {
            depth = 1;
            index += 1;
        } else if (depth > 0) {
            depth += Number(token === '(') - Number(token === ')');
            index += token.length;
        } else {
            result += token;
            index += token.length;
        }
    }
    return result;
};

/**
 * Strings aiming at every pattern.
 *
 * @param patterns - patterns a string must match
 * @returns arbitrary aiming at them, or null when fast-check can't generate from them (it has no
 * lookaround, backreferences or `\b`), leaving plain strings and the validator
 */
const fromPatterns = (patterns: readonly string[]): fc.Arbitrary<string> | null => {
    const combined = combinePatterns(patterns);
    for (const source of [combined, stripLookaround(combined)]) {
        try {
            // Same flag validators are expected to use: JSON Schema patterns are Unicode
            return fc.stringMatching(new RegExp(source, 'u'));
        } catch {
            // Not something fast-check can generate from
        }
    }
    return null;
};

/**
 * Strings matching one pattern, for `patternProperties` keys.
 *
 * @param pattern - regular expression source
 * @returns arbitrary, or null if fast-check can't generate from it
 */
export const stringsMatching = (pattern: string): fc.Arbitrary<string> | null =>
    fromPatterns([pattern]);

export interface StringResult {
    readonly arbitrary: fc.Arbitrary<string>;
    readonly exact: boolean;
}

/**
 * Strings satisfying the branch.
 *
 * @param branch - constraints
 * @returns string arbitrary, or null when no string can match
 */
export const stringArbitrary = (branch: Branch): StringResult | null => {
    const { formats, maxLength, minLength, patterns } = branch;
    if (minLength > maxLength) {
        return null;
    }
    const [format] = formats;
    const formatArbitrary = format === undefined ? undefined : formatArbitraries[format];
    const isLengthBound = minLength > 0 || maxLength < Number.POSITIVE_INFINITY;
    const aimedByPattern = patterns.length > 0 ? fromPatterns(patterns) : null;

    const aimed = formatArbitrary ?? aimedByPattern;
    if (aimed) {
        return {
            arbitrary: aimed,
            exact:
                !isLengthBound &&
                formats.length <= 1 &&
                patterns.length <= (formatArbitrary ? 0 : 1) &&
                patterns.every(pattern => !/\(\?<?[!=]/v.test(pattern)),
        };
    }
    return {
        // `binary` covers all of Unicode one code point at a time, which is what lengths count
        arbitrary: fc.string({
            unit: 'binary',
            minLength,
            ...(maxLength < Number.POSITIVE_INFINITY && { maxLength }),
        }),
        exact: patterns.length === 0 && formats.length <= 1,
    };
};
