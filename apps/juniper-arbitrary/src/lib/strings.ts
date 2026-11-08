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

/**
 * A generator of a format's strings, at a fast-check size (its default when undefined), which sets how long its
 * values tend to be.
 */
type FormatArbitrary = (size: fc.Size | undefined) => fc.Arbitrary<string>;

/**
 * A size constraint for a fast-check arbitrary, leaving its default when undefined.
 *
 * @param size - size, if any
 * @returns constraints to spread
 */
const sized = (size: fc.Size | undefined): { readonly size?: fc.Size } => (size ? { size } : {});

const pointerSegment = (size: fc.Size | undefined): fc.Arbitrary<string> =>
    fc
        .string({ unit: 'binary', ...sized(size) })
        .map(segment => segment.replaceAll('~', '~0').replaceAll('/', '~1'));
const jsonPointer = (size: fc.Size | undefined): fc.Arbitrary<string> =>
    fc
        .array(pointerSegment(size), { ...sized(size) })
        .map(segments => segments.map(s => `/${s}`).join(''));

const relativeJsonPointer: FormatArbitrary = size =>
    fc
        .tuple(fc.nat({ max: maxPointerAncestors }), jsonPointer(size))
        .map(([up, pointer]) => `${up}${pointer}`);
const email: FormatArbitrary = size => fc.emailAddress({ ...sized(size) });
const hostname: FormatArbitrary = size => fc.domain({ ...sized(size) });
const url: FormatArbitrary = size => fc.webUrl({ ...sized(size) });

const uriReference = (size: fc.Size | undefined): fc.Arbitrary<string> =>
    fc.oneof(fc.webUrl({ ...sized(size) }), fc.webPath({ ...sized(size) }));

/**
 * The same generator at any size, for the formats whose values are all about as long.
 *
 * @param arbitrary - generator
 * @returns it, at every size
 */
const unsized =
    (arbitrary: fc.Arbitrary<string>): FormatArbitrary =>
    () =>
        arbitrary;

/**
 * Generators for the formats a plain string would practically never satisfy.
 * Any other format (`password`, `binary`, or one a validator doesn't know) accepts plain strings.
 */
const formatArbitraries: Readonly<Record<string, FormatArbitrary | undefined>> = {
    email,
    hostname,
    byte: size => fc.base64String({ ...sized(size) }),
    date: unsized(isoDate.map(date => date.slice(0, dateLength))),
    'date-time': unsized(isoDate),
    duration: unsized(
        fc
            .tuple(
                fc.nat({ max: maxDurationDays }),
                fc.nat({ max: maxHour }),
                fc.nat({ max: maxMinute })
            )
            .map(([days, hours, minutes]) => `P${days}DT${hours}H${minutes}M`)
    ),
    'idn-email': email,
    'idn-hostname': hostname,
    ipv4: unsized(fc.ipV4()),
    ipv6: unsized(fc.ipV6()),
    iri: url,
    'iri-reference': uriReference,
    'json-pointer': jsonPointer,
    regex: unsized(fc.constantFrom('', '.*', '^a+$', '[a-z]{2,4}', '(?:foo|bar)\\d')),
    'relative-json-pointer': relativeJsonPointer,
    time: unsized(isoDate.map(date => date.slice(timeOffset))),
    uri: url,
    'uri-reference': uriReference,
    'uri-template': url,
    uuid: unsized(fc.uuid()),
};

/**
 * The sizes a length-bound string may be drawn from. One size's values cluster around one length (fast-check's
 * `xsmall` emails are 7-15 characters, its `large` ones 170-310), so the default size alone would reject nearly
 * every value of a short `maxLength` or a long `minLength`, and could give up with an `UnsatisfiableSchemaError` on
 * a schema that has values.
 */
const boundSizes: readonly fc.Size[] = ['xsmall', 'small', 'medium', 'large'];

/**
 * How many values of each size {@link atSizes} looks at, from a fixed seed, so the choice is the same every time.
 */
const sizeProbes = 20;

/**
 * Lengths are counted in code points, as JSON Schema does.
 *
 * @param value - string
 * @returns its length in code points
 */
// eslint-disable-next-line @typescript-eslint/no-misused-spread -- code points are what spreading a string yields
const codePoints = (value: string): number => [...value].length;

/**
 * Bounds on a string's length.
 */
export interface LengthBounds {
    readonly minLength: number;
    readonly maxLength: number;
}

/**
 * No bounds on a string's length.
 */
const unbounded: LengthBounds = { minLength: 0, maxLength: Number.POSITIVE_INFINITY };

/**
 * A generator at fast-check's default size or, when the string's length is bound, drawn evenly from the sizes of
 * {@link boundSizes} that produced a value within the bounds from a fixed-seed sample, so a size that only wastes
 * attempts (a `large` URL for a `maxLength` of 20) is left out. With none, every size is kept, and the validator
 * decides.
 *
 * @param make - generator at a size
 * @param bounds - the schema's length bounds
 * @returns arbitrary
 */
const atSizes = (
    make: (size: fc.Size | undefined) => fc.Arbitrary<string>,
    { minLength, maxLength }: LengthBounds
): fc.Arbitrary<string> => {
    if (minLength === 0 && maxLength === Number.POSITIVE_INFINITY) {
        return make(undefined);
    }
    const isInBounds = (value: string): boolean => {
        const length = codePoints(value);
        return length >= minLength && length <= maxLength;
    };
    const fitting = boundSizes.filter(size =>
        fc.sample(make(size), { numRuns: sizeProbes, seed: 0 }).some(value => isInBounds(value))
    );
    const sizes = fitting.length > 0 ? fitting : boundSizes;
    return fc.oneof(...sizes.map(size => make(size)));
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
 * @param bounds - the schema's length bounds, see {@link atSizes}
 * @returns arbitrary aiming at them, or null when fast-check can't generate from them (it has no
 * lookaround, backreferences or `\b`), leaving plain strings and the validator
 */
const fromPatterns = (
    patterns: readonly string[],
    bounds: LengthBounds
): fc.Arbitrary<string> | null => {
    const combined = combinePatterns(patterns);
    for (const source of [combined, stripLookaround(combined)]) {
        let regex: RegExp;
        try {
            // Same flag validators are expected to use: JSON Schema patterns are Unicode
            regex = new RegExp(source, 'u');
            // Throws for what fast-check can't generate from
            fc.stringMatching(regex);
        } catch {
            continue;
        }
        return atSizes(size => fc.stringMatching(regex, { ...sized(size) }), bounds);
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
    fromPatterns([pattern], unbounded);

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
    const makeFormat = format === undefined ? undefined : formatArbitraries[format];
    const isLengthBound = minLength > 0 || maxLength < Number.POSITIVE_INFINITY;
    const formatArbitrary = makeFormat && atSizes(makeFormat, branch);
    const aimedByPattern = patterns.length > 0 ? fromPatterns(patterns, branch) : null;

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
