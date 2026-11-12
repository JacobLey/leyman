/**
 * Radix of the code points in `\u{…}` escapes.
 */
export const hexadecimal = 16;

/**
 * Inclusive ranges of characters, by their first and last character.
 */
type CharacterRanges = readonly (readonly [first: string, last: string])[];

/**
 * Characters that may start an XML name, minus the colon
 * ([XML 1.0 §2.3 `NameStartChar`](https://www.w3.org/TR/xml/#NT-NameStartChar)).
 */
const nameStartRangesNoColon: CharacterRanges = [
    ['A', 'Z'],
    ['_', '_'],
    ['a', 'z'],
    ['\u{C0}', '\u{D6}'],
    ['\u{D8}', '\u{F6}'],
    ['\u{F8}', '\u{2FF}'],
    ['\u{370}', '\u{37D}'],
    ['\u{37F}', '\u{1FFF}'],
    ['\u{200C}', '\u{200D}'],
    ['\u{2070}', '\u{218F}'],
    ['\u{2C00}', '\u{2FEF}'],
    ['\u{3001}', '\u{D7FF}'],
    ['\u{F900}', '\u{FDCF}'],
    ['\u{FDF0}', '\u{FFFD}'],
    ['\u{10000}', '\u{EFFFF}'],
];

/**
 * Characters that may continue an XML name but not start one
 * ([XML 1.0 §2.3 `NameChar`](https://www.w3.org/TR/xml/#NT-NameChar)).
 */
const nameCharOnlyRanges: CharacterRanges = [
    ['-', '.'],
    ['0', '9'],
    ['\u{B7}', '\u{B7}'],
    ['\u{300}', '\u{36F}'],
    ['\u{203F}', '\u{2040}'],
];

/**
 * Escapes a character for a `v`-flag regular expression, as `\u{…}`.
 *
 * @param character - one code point
 * @returns its escape
 */
export const escapeCodePoint = (character: string): string =>
    String.raw`\u{${character.codePointAt(0)!.toString(hexadecimal)}}`;

/**
 * Writes ranges as the inside of a `v`-flag character class.
 *
 * @param ranges - the characters
 * @returns the class contents, every character escaped
 */
const classOf = (ranges: CharacterRanges): string =>
    ranges
        .map(([first, last]) =>
            first === last
                ? escapeCodePoint(first)
                : `${escapeCodePoint(first)}-${escapeCodePoint(last)}`
        )
        .join('');

/**
 * `NameStartChar` without the colon, as the inside of a `v`-flag character class.
 */
const nameStartCharsNoColon = classOf(nameStartRangesNoColon);

/**
 * `NameChar` minus `NameStartChar`, as the inside of a `v`-flag character class.
 */
const nameCharsOnly = classOf(nameCharOnlyRanges);

/**
 * `NameStartChar`, as the inside of a `v`-flag character class.
 */
export const nameStartChars = `${escapeCodePoint(':')}${nameStartCharsNoColon}`;

/**
 * `NameChar`, as the inside of a `v`-flag character class.
 */
export const nameChars = `${nameStartChars}${nameCharsOnly}`;

/**
 * An XML `Name`.
 */
export const namePattern = new RegExp(`^[${nameStartChars}][${nameChars}]*$`, 'v');

/**
 * An `NCName`: an XML name without a colon
 * ([Namespaces in XML 1.0 §3](https://www.w3.org/TR/xml-names/#NT-NCName)).
 */
export const ncNamePattern = new RegExp(
    `^[${nameStartCharsNoColon}][${nameStartCharsNoColon}${nameCharsOnly}]*$`,
    'v'
);

/**
 * An XML `Nmtoken`: one or more name characters.
 */
export const nmtokenPattern = new RegExp(`^[${nameChars}]+$`, 'v');
