/* eslint-disable @typescript-eslint/no-magic-numbers, no-bitwise -- Hashing is defined by its bit operations and constants */

import { mix32 } from './random.js';

// Leading byte of a UTF-8 sequence, indexed by its length in bytes
const LEAD_BYTES = [0, 0, 0xc0, 0xe0, 0xf0] as const;

/**
 * Number of bytes to encode a code point in UTF-8 (not ASCII, which is handled inline).
 *
 * @param code - code point >= 0x80
 * @returns 2, 3 or 4
 */
const utf8Length = (code: number): number => {
    if (code < 0x800) {
        return 2;
    }
    return code < 0x10000 ? 3 : 4;
};

/**
 * Hash of a key: two unsigned 32 bit lanes.
 *
 * Read by index rather than destructured, as array destructuring goes through
 * the iterator protocol, which made lookups ~40% slower.
 */
export type KeyHash = readonly [lane0: number, lane1: number];

/**
 * Non-cryptographic hash of the UTF-8 bytes of a string (two 32 bit lanes, as in cyrb53).
 *
 * UTF-8 (rather than JavaScript's UTF-16 code units) is what other languages can hash natively.
 * The bytes are encoded inline, rather than with `TextEncoder`, which allocates a buffer per key and doubles the cost.
 * Lone surrogates are encoded as U+FFFD, the same as `TextEncoder`.
 *
 * @param key - value to be hashed
 * @param seed - unsigned 32 bit integer, selects an independent hash function
 * @returns two unsigned 32 bit lanes
 */
export const hashKey = (key: string, seed: number): KeyHash => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    let { length } = key;

    for (let i = 0; i < key.length; i++) {
        // eslint-disable-next-line unicorn/prefer-code-point -- `codePointAt` is slower, even for ASCII
        let code = key.charCodeAt(i);
        if (code < 0x80) {
            // ASCII is a single byte, kept inline as by far the most common case
            h1 = Math.imul(h1 ^ code, 2_654_435_761);
            h2 = Math.imul(h2 ^ code, 1_597_334_677);
            continue;
        }
        if (code >= 0xd800 && code < 0xe000) {
            // A high surrogate followed by a low surrogate is one code point, anything else is lone
            // eslint-disable-next-line unicorn/prefer-code-point -- Pairs surrogates by hand, see above
            const low = code < 0xdc00 ? key.charCodeAt(i + 1) : 0;
            if (low >= 0xdc00 && low < 0xe000) {
                code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
                i++;
            } else {
                code = 0xfffd;
            }
            // Either 2 code units become 4 bytes, or 1 becomes 3
            length += 2;
        } else {
            // `length` already counted the code unit as 1 byte
            length += code < 0x800 ? 1 : 2;
        }
        // Leading byte, then continuation bytes of 6 bits each
        const byteLength = utf8Length(code);
        const leadShift = 6 * (byteLength - 1);
        let byte = LEAD_BYTES[byteLength]! | (code >>> leadShift);
        for (let shift = leadShift; shift >= 0; shift -= 6) {
            h1 = Math.imul(h1 ^ byte, 2_654_435_761);
            h2 = Math.imul(h2 ^ byte, 1_597_334_677);
            byte = 0x80 | ((code >>> (shift - 6)) & 0x3f);
        }
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2_246_822_507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3_266_489_909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2_246_822_507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3_266_489_909);
    return [h1 >>> 0, mix32(h2, length)];
};
