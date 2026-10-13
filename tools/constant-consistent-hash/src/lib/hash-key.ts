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
 * Hash of a key: two 32 bit lanes, from which independent words are derived on demand (see {@link keyWord}).
 */
export type KeyHash = readonly [h1: number, lane: number];

/**
 * Non-cryptographic hash of the UTF-8 bytes of a string (two 32 bit lanes, as in cyrb53).
 *
 * UTF-8 (rather than JavaScript's UTF-16 code units) is what other languages can hash natively.
 * The bytes are encoded inline, rather than with `TextEncoder`, which allocates a buffer per key and doubles the cost.
 * Lone surrogates are encoded as U+FFFD, the same as `TextEncoder`.
 *
 * @param key - value to be hashed
 * @param seed - unsigned 32 bit integer, selects an independent hash function
 * @returns two 32 bit lanes, to derive words from with {@link keyWord}
 */
export const hashKey = (key: string, seed: number): KeyHash => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    let { length } = key;

    for (let i = 0; i < key.length; i++) {
        // Combines surrogate pairs, but returns a lone surrogate as is
        const code = key.codePointAt(i)!;
        if (code < 0x80) {
            // ASCII is a single byte, kept inline as by far the most common case
            h1 = Math.imul(h1 ^ code, 2_654_435_761);
            h2 = Math.imul(h2 ^ code, 1_597_334_677);
        } else {
            const char = code >= 0xd800 && code < 0xe000 ? 0xfffd : code;
            const byteLength = utf8Length(char);
            // `length` already counted each UTF-16 code unit once
            length += byteLength - (char > 0xffff ? 2 : 1);
            if (char > 0xffff) {
                // Skip the low surrogate
                i++;
            }
            // Leading byte, then continuation bytes of 6 bits each
            const leadShift = 6 * (byteLength - 1);
            let byte = LEAD_BYTES[byteLength]! | (char >>> leadShift);
            for (let shift = leadShift; shift >= 0; shift -= 6) {
                h1 = Math.imul(h1 ^ byte, 2_654_435_761);
                h2 = Math.imul(h2 ^ byte, 1_597_334_677);
                byte = 0x80 | ((char >>> (shift - 6)) & 0x3f);
            }
        }
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2_246_822_507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3_266_489_909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2_246_822_507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3_266_489_909);
    return [h1, mix32(h2, length)];
};

/**
 * Independent 32 bit word of a key's hash.
 *
 * Derived on demand, as most lookups only need the first 3.
 * Indexes `hash` rather than destructuring it, as array destructuring goes through
 * the iterator protocol, which made lookups ~40% slower.
 *
 * @param hash - lanes from {@link hashKey}
 * @param index - 0 to 4
 * @returns unsigned 32 bit integer
 */
export const keyWord = (hash: KeyHash, index: number): number =>
    mix32(hash[0] ^ mix32(hash[1], index), index);
