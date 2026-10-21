/* eslint-disable @typescript-eslint/no-magic-numbers -- RFC 3492's constants */

import { checkOverflow, rangeError } from '#errors';

//
// Highest positive signed 32-bit float value
//
const maxInt = 0x7fffffff;

//
// Bootstring parameters
//
const base = 36;
const tMin = 1;
const tMax = 26;
const skew = 38;
const damp = 700;
const initialBias = 72;
const initialN = 128; // 0x80
const delimiter = '-'; // '\x2D'

const baseMinusTMin = base - tMin;

//
// Regular expressions
//
const regexNonASCII = /[^\0-\u{7F}]/u; // Non-ASCII chars. Note: U+007F DEL is excluded too.
const regexSeparators = /[\u{2E}\u{3002}\u{FF0E}\u{FF61}]/gu; // RFC 3490 separators

/**
 * A simple `Array#map`-like wrapper to work with domain name strings or email addresses.
 *
 * @param domain - The domain name or email address.
 * @param callback - The function that gets called for every character.
 * @returns A new string of characters returned by the callback function.
 */
const mapDomain = (domain: string, callback: (input: string) => string): string => {
    const [first, ...rest] = domain.split('@');
    let result: string;
    let toEncode: string;
    if (rest.length > 0) {
        // In email addresses, only the domain name should be punycoded. Leave
        // the local part (i.e. everything up to `@`) intact.
        result = `${first!}@`;
        toEncode = rest.join('@');
    } else {
        result = '';
        toEncode = first!;
    }
    const labels = toEncode.split(regexSeparators);
    const encoded = labels.map(x => callback(x)).join('.');
    return result + encoded;
};

/**
 * Creates an array containing the numeric code points of each Unicode
 * character in the string. While JavaScript uses UCS-2 internally,
 * this function will convert a pair of surrogate halves (each of which
 * UCS-2 exposes as separate characters) into a single code point,
 * matching UTF-16.
 *
 * @see {@link https://mathiasbynens.be/notes/javascript-encoding}
 *
 * @param string - The Unicode input string (UCS-2).
 * @returns The new array of code points.
 */
export const ucs2Decode = (string: string): number[] => {
    const output: number[] = [];
    let counter = 0;
    while (counter < string.length) {
        // eslint-disable-next-line unicorn/prefer-code-point -- Reads UTF-16 code units, to pair surrogates as RFC 3492 does
        const value = string.charCodeAt(counter);
        ++counter;
        if (value >= 0xd800 && value <= 0xdbff && counter < string.length) {
            // It's a high surrogate, and there is a next character.
            // eslint-disable-next-line unicorn/prefer-code-point -- Reads UTF-16 code units, to pair surrogates as RFC 3492 does
            const extra = string.charCodeAt(counter);
            ++counter;
            if ((extra & 0xfc00) === 0xdc00) {
                // Low surrogate.
                output.push(((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000);
            } else {
                // It's an unmatched surrogate; only append this code unit, in case the
                // next code unit is the high surrogate of a surrogate pair.
                output.push(value);
                --counter;
            }
        } else {
            output.push(value);
        }
    }
    return output;
};

/**
 * Creates a string based on an array of numeric code points.
 *
 * @param codePoints - The array of numeric code points.
 * @returns The new Unicode string (UCS-2).
 */
export const ucs2Encode = (codePoints: readonly number[]): string =>
    String.fromCodePoint(...codePoints);

/**
 * Converts a basic code point into a digit/integer.
 *
 * @param codePoint - The basic numeric code point value.
 * @returns The numeric value of a basic code point (for use in
 * representing integers) in the range `0` to `base - 1`, or `base` if
 * the code point does not represent a value.
 */
const basicToDigit = (codePoint: number): number => {
    if (codePoint >= 0x30 && codePoint < 0x3a) {
        return 26 + (codePoint - 0x30);
    }
    if (codePoint >= 0x41 && codePoint < 0x5b) {
        return codePoint - 0x41;
    }
    return codePoint >= 0x61 && codePoint < 0x7b ? codePoint - 0x61 : base;
};

/**
 * Converts a digit/integer into a basic code point.
 *
 * @param digit - The numeric value of a basic code point.
 * @returns The basic code point whose value (when used for
 * representing integers) is `digit`, which needs to be in the range
 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
 * used; else, the lowercase form is used. The behavior is undefined
 * if `flag` is non-zero and `digit` has no uppercase form.
 */
const digitToBasic = (digit: number): number => {
    const plus22 = digit + 22;
    //  0..25 map to ASCII a..z or A..Z
    // 26..35 map to ASCII 0..9
    return digit < 26 ? plus22 + 75 : plus22;
};

/**
 * Bias adaptation function as per section 3.4 of RFC 3492.
 *
 * @see {@link https://tools.ietf.org/html/rfc3492#section-3.4}
 *
 * @param delta - encoded delta
 * @param numPoints - number of points points
 * @param isFirstTime - whether this is the first adaptation
 * @returns bias adaptation
 */
const adapt = (delta: number, numPoints: number, isFirstTime: boolean): number => {
    let k = 0;
    let newDelta = isFirstTime ? Math.floor(delta / damp) : delta >> 1;
    newDelta += Math.floor(newDelta / numPoints);
    const minCheck = (baseMinusTMin * tMax) >> 1;
    while (newDelta > minCheck) {
        newDelta = Math.floor(newDelta / baseMinusTMin);
        k += base;
    }
    return Math.floor(k + ((baseMinusTMin + 1) * newDelta) / (newDelta + skew));
};

/**
 * Threshold for the digit at position `k` of a generalized variable-length integer, as per section 3.3 of RFC 3492.
 *
 * @see {@link https://tools.ietf.org/html/rfc3492#section-3.3}
 *
 * @param k - position of the digit, as a multiple of `base`
 * @param bias - current bias
 * @returns threshold, clamped to `tMin` and `tMax`
 */
const threshold = (k: number, bias: number): number => {
    if (k <= bias) {
        return tMin;
    }
    return k >= bias + tMax ? tMax : k - bias;
};

/**
 * Decode a generalized variable-length integer, as per section 3.3 of RFC 3492.
 *
 * The overflow checking is easier if we increase `i` as we go,
 * so the integer is added to `i` rather than returned on its own.
 *
 * @param input - Punycode string
 * @param start - index of the first character of the integer
 * @param i - value to add the integer to
 * @param bias - current bias
 * @returns index of the next character to be consumed, and `i` plus the integer
 */
const decodeInteger = (
    input: string,
    start: number,
    i: number,
    bias: number
): { index: number; i: number } => {
    let index = start;
    let sum = i;
    let w = 1;
    let k = base;
    while (true) {
        checkOverflow(index, input.length, {
            gte: true,
            error: 'invalid-input',
        });

        const digit = basicToDigit(input.codePointAt(index)!);
        ++index;

        checkOverflow(digit, base, { gte: true, error: 'invalid-input' });
        checkOverflow(digit, Math.floor((maxInt - sum) / w));

        sum += digit * w;
        const t = threshold(k, bias);

        if (digit < t) {
            return { index, i: sum };
        }

        const baseMinusT = base - t;
        checkOverflow(w, Math.floor(maxInt / baseMinusT));

        w *= baseMinusT;
        k += base;
    }
};

/**
 * Encode a generalized variable-length integer, as per section 3.3 of RFC 3492.
 *
 * @param delta - integer to encode
 * @param bias - current bias
 * @returns basic code points representing the integer
 */
const encodeInteger = (delta: number, bias: number): string[] => {
    const output: string[] = [];
    let q = delta;
    let k = base;
    while (true) {
        const t = threshold(k, bias);
        if (q < t) {
            output.push(String.fromCodePoint(digitToBasic(q)));
            return output;
        }
        const qMinusT = q - t;
        const baseMinusT = base - t;
        output.push(String.fromCodePoint(digitToBasic(t + (qMinusT % baseMinusT))));
        q = Math.floor(qMinusT / baseMinusT);
        k += base;
    }
};

/**
 * Converts a Punycode string of ASCII-only symbols to a string of Unicode symbols.
 *
 * @param input - The Punycode string of ASCII-only symbols.
 * @returns The resulting string of Unicode symbols.
 */
export const decode = (input: string): string => {
    // Don't use UCS-2.
    const output: number[] = [];
    const inputLength = input.length;
    let i = 0;
    let n = initialN;
    let bias = initialBias;

    // Handle the basic code points: let `basic` be the number of input code
    // points before the last delimiter, or `0` if there is none, then copy
    // the first basic code points to the output.

    let basic = input.lastIndexOf(delimiter);
    if (basic < 0) {
        basic = 0;
    }

    for (let j = 0; j < basic; ++j) {
        const codePoint = input.codePointAt(j)!;
        // If it's not a basic code point
        if (codePoint >= 0x80) {
            rangeError('not-basic');
        }
        output.push(codePoint);
    }

    // Main decoding loop: start just after the last delimiter if any basic code
    // points were copied; start at the beginning otherwise.

    let index = basic > 0 ? basic + 1 : 0;
    while (index < inputLength) {
        // `index` is the index of the next character to be consumed.
        // Decode a generalized variable-length integer into `delta`,
        // which gets added to `i`.
        const oldi = i;
        ({ index, i } = decodeInteger(input, index, i, bias));

        const out = output.length + 1;
        bias = adapt(i - oldi, out, oldi === 0);

        // `i` was supposed to wrap around from `out` to `0`,
        // incrementing `n` each time, so we'll fix that now:
        checkOverflow(Math.floor(i / out), maxInt - n);

        n += Math.floor(i / out);
        i %= out;

        // Insert `n` at position `i` of the output.
        output.splice(i, 0, n);
        ++i;
    }

    return String.fromCodePoint(...output);
};

/**
 * Converts a string of Unicode symbols (e.g. a domain name label) to a
 * Punycode string of ASCII-only symbols.
 *
 * @param input - The string of Unicode symbols.
 * @returns The resulting Punycode string of ASCII-only symbols.
 */
export const encode = (input: string): string => {
    const output: string[] = [];

    // Convert the input in UCS-2 to an array of Unicode code points.
    const decodedInput = ucs2Decode(input);

    // Cache the length.
    const inputLength = decodedInput.length;

    // Initialize the state.
    let n = initialN;
    let delta = 0;
    let bias = initialBias;

    // Handle the basic code points.
    for (const currentValue of decodedInput) {
        if (currentValue < 0x80) {
            output.push(String.fromCodePoint(currentValue));
        }
    }

    const basicLength = output.length;
    let handledCPCount = basicLength;

    // `handledCPCount` is the number of code points that have been handled;
    // `basicLength` is the number of basic code points.

    // Finish the basic string with a delimiter unless it's empty.
    if (basicLength) {
        output.push(delimiter);
    }

    // Main encoding loop:
    while (handledCPCount < inputLength) {
        // All non-basic code points < n have been handled already. Find the next
        // larger one:
        let m = maxInt;
        for (const currentValue of decodedInput) {
            if (currentValue >= n && currentValue < m) {
                m = currentValue;
            }
        }

        // Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
        // but guard against overflow.
        const handledCPCountPlusOne = handledCPCount + 1;
        checkOverflow(m - n, Math.floor((maxInt - delta) / handledCPCountPlusOne));

        delta += (m - n) * handledCPCountPlusOne;
        n = m;

        for (const currentValue of decodedInput) {
            if (currentValue < n) {
                ++delta;
                checkOverflow(delta, maxInt);
            }
            if (currentValue !== n) {
                continue;
            }
            // Represent delta as a generalized variable-length integer.
            output.push(...encodeInteger(delta, bias));
            bias = adapt(delta, handledCPCountPlusOne, handledCPCount === basicLength);
            delta = 0;
            ++handledCPCount;
        }

        ++delta;
        ++n;
    }
    return output.join('');
};

/**
 * Converts a Punycode string representing a domain name or an email address
 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
 * it doesn't matter if you call it on a string that has already been
 * converted to Unicode.
 *
 * @param input - The Punycoded domain name or email address to
 * convert to Unicode.
 * @returns The Unicode representation of the given Punycode
 * string.
 */
export const toUnicode = (input: string): string =>
    mapDomain(input, (str: string) =>
        str.startsWith('xn--') ? decode(str.slice(4).toLowerCase()) : str
    );

/**
 * Converts a Unicode string representing a domain name or an email address to
 * Punycode. Only the non-ASCII parts of the domain name will be converted,
 * i.e. it doesn't matter if you call it with a domain that's already in
 * ASCII.
 *
 * @param input - The domain name or email address to convert, as a
 * Unicode string.
 * @returns The Punycode representation of the given domain name or
 * email address.
 */
export const toASCII = (input: string): string =>
    mapDomain(input, (string: string) =>
        regexNonASCII.test(string) ? `xn--${encode(string)}` : string
    );
