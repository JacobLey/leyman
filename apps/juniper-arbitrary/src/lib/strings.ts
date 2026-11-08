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

const isUnbounded = ({ minLength, maxLength }: LengthBounds): boolean =>
    minLength === 0 && maxLength === Number.POSITIVE_INFINITY;

/**
 * Lengths are counted in code points, as JSON Schema does.
 *
 * @param value - string
 * @returns its length in code points
 */
// eslint-disable-next-line @typescript-eslint/no-misused-spread -- code points are what spreading a string yields
const codePoints = (value: string): number => [...value].length;

/**
 * A size constraint for a fast-check arbitrary, leaving its default when undefined.
 *
 * @param size - size, if any
 * @returns constraints to spread
 */
const sized = (size: fc.Size | undefined): { readonly size?: fc.Size } => (size ? { size } : {});

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
 * A generator at fast-check's default size or, when the string's length is bound, drawn from the sizes of
 * {@link boundSizes} weighted by how many values of a fixed-seed sample fell within the bounds, so a size that
 * mostly wastes attempts (a `medium` URL for a `maxLength` of 40) is rarely drawn and one that only wastes them
 * (a `large` one) never is. Sizes past the first whose values mostly overshoot `maxLength` aren't sampled, as their
 * values only get longer (a `large` JSON pointer runs to hundreds of thousands of characters). With no size within
 * the bounds, every size sampled is drawn evenly, and the validator decides.
 *
 * @param make - generator at a size
 * @param bounds - the schema's length bounds
 * @returns arbitrary
 */
const atSizes = (
    make: (size: fc.Size | undefined) => fc.Arbitrary<string>,
    bounds: LengthBounds
): fc.Arbitrary<string> => {
    if (isUnbounded(bounds)) {
        return make(undefined);
    }
    const weighted: { readonly arbitrary: fc.Arbitrary<string>; readonly weight: number }[] = [];
    for (const size of boundSizes) {
        const arbitrary = make(size);
        const lengths = fc
            .sample(arbitrary, { numRuns: sizeProbes, seed: 0 })
            .map(value => codePoints(value));
        weighted.push({
            arbitrary,
            weight: lengths.filter(
                length => length >= bounds.minLength && length <= bounds.maxLength
            ).length,
        });
        if (lengths.filter(length => length > bounds.maxLength).length > sizeProbes / 2) {
            break;
        }
    }
    const fitting = weighted.filter(({ weight }) => weight > 0);
    return fitting.length > 0
        ? fc.oneof(...fitting)
        : fc.oneof(...weighted.map(({ arbitrary }) => arbitrary));
};

/**
 * Characters any of the lengthened formats takes in the place they're added: a URI fragment, a
 * hostname label, an email's local part, a JSON pointer segment.
 */
// eslint-disable-next-line @typescript-eslint/no-misused-spread -- ASCII only, one character per code unit
const fillCharacters = [...'abcdefghijklmnopqrstuvwxyz0123456789'];

/**
 * Exactly so many {@link fillCharacters}.
 *
 * @param length - how many
 * @returns arbitrary
 */
const fill = (length: number): fc.Arbitrary<string> =>
    fc.string({ unit: fc.constantFrom(...fillCharacters), minLength: length, maxLength: length });

/**
 * Lengthen a format's value, keeping it valid for the format.
 *
 * @param value - value of the format
 * @param missing - how many code points to add
 * @returns values `missing` longer, or as long as the format allows
 */
type Lengthen = (value: string, missing: number) => fc.Arbitrary<string>;

/**
 * A generator of a format's strings, within length bounds as far as the format allows.
 */
type FormatArbitrary = (bounds: LengthBounds) => fc.Arbitrary<string>;

/**
 * The same generator at any bounds, for the formats whose values are all about as long. A bound
 * they can't meet is left to the validator.
 *
 * @param arbitrary - generator
 * @returns it, at every bound
 */
const fixedLength =
    (arbitrary: fc.Arbitrary<string>): FormatArbitrary =>
    () =>
        arbitrary;

/**
 * A format drawn at the sizes whose values fit `maxLength`, then lengthened to a length chosen
 * between the bounds when it falls short of it, so values spread across the bounds rather than
 * piling up at `minLength`. Unbounded, it is the generator at its default size.
 *
 * @param make - generator at a size
 * @param lengthen - lengthen one of its values
 * @param [longest] - the longest a value can be lengthened to
 * @returns format generator
 */
const lengthened =
    (
        make: (size: fc.Size | undefined) => fc.Arbitrary<string>,
        lengthen: Lengthen,
        longest = Number.POSITIVE_INFINITY
    ): FormatArbitrary =>
    bounds => {
        const { minLength, maxLength } = bounds;
        const base = atSizes(make, { minLength: 0, maxLength });
        if (minLength === 0) {
            return base;
        }
        // Without a `maxLength`, up to twice `minLength`: longer values come from the sizes anyway
        const upper = Math.min(
            maxLength === Number.POSITIVE_INFINITY ? 2 * minLength : maxLength,
            longest
        );
        return fc
            .tuple(base, fc.integer({ min: minLength, max: Math.max(minLength, upper) }))
            .chain(([value, target]) => {
                const missing = target - codePoints(value);
                return missing > 0 ? lengthen(value, missing) : fc.constant(value);
            });
    };

/**
 * Lengthen a URI, or a URI reference, with a fragment, which takes the unreserved characters
 * wherever it starts (RFC 3986 §3.5, and `ajv-formats`'s `uri`, `uri-reference` and
 * `uri-template`: https://github.com/ajv-validator/ajv-formats/blob/v3.0.1/src/formats.ts). The
 * URIs fast-check generates have none of their own.
 *
 * @param value - URI to lengthen
 * @param missing - how many code points to add
 * @returns longer URIs
 */
const lengthenUri: Lengthen = (value, missing) =>
    fill(missing - 1).map(fragment => `${value}#${fragment}`);

// RFC 1035 §2.3.4, as `ajv-formats`'s `hostname` checks: https://github.com/ajv-validator/ajv-formats/blob/v3.0.1/src/formats.ts#L52-L53
const maxLabelLength = 63;
const maxHostnameLength = 253;
// RFC 5321 §4.5.3.1.1
const maxLocalPartLength = 64;

/**
 * The lengths of labels that, each with its dot, take up exactly so many characters.
 *
 * @param length - characters to fill, at least 2
 * @returns label lengths, each 1 to {@link maxLabelLength}
 */
const labelLengths = (length: number): number[] => {
    const lengths: number[] = [];
    let rest = length;
    while (rest > 0) {
        // Leave at least 2 for the last label, as a label has at least 1 character besides its dot
        const label =
            rest - 1 > maxLabelLength ? Math.min(maxLabelLength, rest - '.a.'.length) : rest - 1;
        lengths.push(label);
        rest -= label + 1;
    }
    return lengths;
};

/**
 * Lengthen a hostname with new labels before it, up to {@link maxHostnameLength} in all. Labels
 * are only letters and digits, which may start and end one. A single character, too few for a
 * label and its dot, goes on the front of the first label instead, when it has room.
 *
 * @param value - hostname to lengthen
 * @param missing - how many code points to add
 * @returns longer hostnames
 */
const lengthenHostname: Lengthen = (value, missing) => {
    const room = Math.max(0, Math.min(missing, maxHostnameLength - value.length));
    const firstLabel = value.split('.', 1)[0]!.length;
    const grow = room === 1 ? Math.min(1, maxLabelLength - firstLabel) : 0;
    const added = room === 1 ? [] : labelLengths(room);
    return fc
        .tuple(fill(grow), ...added.map(length => fill(length)))
        .map(([growth, ...labels]) => [...labels, growth + value].join('.'));
};

/**
 * Lengthen an email address: its local part up to {@link maxLocalPartLength}, with letters and
 * digits at its end, then its domain as a hostname.
 *
 * @param value - email address
 * @param missing - how many code points to add
 * @returns longer email addresses
 */
const lengthenEmail: Lengthen = (value, missing) => {
    const at = value.lastIndexOf('@');
    const local = value.slice(0, at);
    const grow = Math.max(0, Math.min(missing, maxLocalPartLength - local.length));
    return fc
        .tuple(fill(grow), lengthenHostname(value.slice(at + 1), missing - grow))
        .map(([growth, domain]) => `${local}${growth}@${domain}`);
};

/**
 * Lengthen a JSON pointer, or a relative one, with a segment.
 *
 * @param value - JSON pointer
 * @param missing - how many code points to add
 * @returns longer pointers
 */
const lengthenPointer: Lengthen = (value, missing) =>
    fill(missing - 1).map(segment => `${value}/${segment}`);

const pointerSegment = (size: fc.Size | undefined): fc.Arbitrary<string> =>
    fc
        .string({ unit: 'binary', ...sized(size) })
        .map(segment => segment.replaceAll('~', '~0').replaceAll('/', '~1'));
const jsonPointer = (size: fc.Size | undefined): fc.Arbitrary<string> =>
    fc
        .array(pointerSegment(size), { ...sized(size) })
        .map(segments => segments.map(s => `/${s}`).join(''));
const relativeJsonPointer = (size: fc.Size | undefined): fc.Arbitrary<string> =>
    fc
        .tuple(fc.nat({ max: maxPointerAncestors }), jsonPointer(size))
        .map(([up, pointer]) => `${up}${pointer}`);

const email = lengthened(
    size => fc.emailAddress({ ...sized(size) }),
    lengthenEmail,
    maxLocalPartLength + '@'.length + maxHostnameLength
);
const hostname = lengthened(
    size => fc.domain({ ...sized(size) }),
    lengthenHostname,
    maxHostnameLength
);
const url = lengthened(size => fc.webUrl({ ...sized(size) }), lengthenUri);
const uriReference = lengthened(
    size => fc.oneof(fc.webUrl({ ...sized(size) }), fc.webPath({ ...sized(size) })),
    lengthenUri
);

const base64Group = 4;

/**
 * Base64 in whole groups of 4, the only lengths `ajv-formats`'s `byte` takes
 * (https://github.com/ajv-validator/ajv-formats/blob/v3.0.1/src/formats.ts#L189), which fast-check
 * picks between the bounds itself. Bounds with no multiple of 4 between them are left to the
 * validator.
 *
 * @param bounds - length bounds
 * @returns base64 strings
 */
const byte: FormatArbitrary = bounds => {
    const minLength = Math.ceil(bounds.minLength / base64Group) * base64Group;
    const maxLength = Math.floor(bounds.maxLength / base64Group) * base64Group;
    if (isUnbounded(bounds) || minLength > maxLength) {
        return fc.base64String();
    }
    return fc.base64String({
        minLength,
        ...(maxLength < Number.POSITIVE_INFINITY && { maxLength }),
    });
};

/**
 * Generators for the formats a plain string would practically never satisfy.
 * Any other format (`password`, `binary`, or one a validator doesn't know) accepts plain strings.
 * `ajv-formats` doesn't know the `idn-` and `iri` ones either, so they get their ASCII form's.
 */
const formatArbitraries: Readonly<Record<string, FormatArbitrary | undefined>> = {
    byte,
    email,
    hostname,
    date: fixedLength(isoDate.map(date => date.slice(0, dateLength))),
    'date-time': fixedLength(isoDate),
    duration: fixedLength(
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
    ipv4: fixedLength(fc.ipV4()),
    ipv6: fixedLength(fc.ipV6()),
    iri: url,
    'iri-reference': uriReference,
    'json-pointer': lengthened(jsonPointer, lengthenPointer),
    regex: fixedLength(fc.constantFrom('', '.*', '^a+$', '[a-z]{2,4}', '(?:foo|bar)\\d')),
    'relative-json-pointer': lengthened(relativeJsonPointer, lengthenPointer),
    time: fixedLength(isoDate.map(date => date.slice(timeOffset))),
    uri: url,
    'uri-reference': uriReference,
    'uri-template': url,
    uuid: fixedLength(fc.uuid()),
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
    const formatArbitrary = makeFormat?.(branch);
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
