/* eslint-disable @typescript-eslint/no-magic-numbers, no-bitwise -- Hashing is defined by its bit operations and constants */

import type { hashKey, KeyHash } from './hash-key.js';

/**
 * Distinguishes the random values drawn for the same block.
 */
export enum Salt {
    /**
     * Position of the highest bucket a key lands on within a block.
     */
    TOP = 0,
    /**
     * Whether the key also lands on a second, lower, bucket in that block.
     */
    PAIR = 1,
    /**
     * Position of that second bucket.
     */
    SECOND = 2,
}

/**
 * 32 bit integer hash (lowbias32) of a seed offset by an index.
 *
 * @param seed - 32 bit integer
 * @param index - non-negative integer
 * @returns unsigned 32 bit integer
 */
export const mix32 = (seed: number, index: number): number => {
    // Not truncated to 32 bits yet, the shifts below wrap it
    let x = seed + Math.imul(index + 1, 0x9e3779b9);
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
};

/**
 * Highest block below 2^power that holds a jump, one random bit per block.
 *
 * The 48 bits are the first lane (bits 0 to 31) and the top half of the second lane (bits 32 to 47),
 * read with `Math.clz32` instead of floating point modulo and logarithms.
 *
 * @param hash - lanes from {@link hashKey}
 * @param power - number of blocks, 0 to 48
 * @returns index of the highest set bit among the low `power` bits, or -1 when none are set
 */
export const highestBlock = (hash: KeyHash, power: number): number => {
    if (power > 32) {
        const high = (hash[1] >>> 16) & ((1 << (power - 32)) - 1);
        return high === 0 ? 31 - Math.clz32(hash[0]) : 63 - Math.clz32(high);
    }
    // `>>> 32` does not shift at all, so 0 blocks are handled separately
    return power === 0 ? -1 : 31 - Math.clz32(hash[0] & (0xffffffff >>> (32 - power)));
};

/**
 * Index of the random value drawn for a block and salt.
 *
 * @param block - index of the power of 2 block
 * @param salt - distinguishes values for the same block
 * @returns non-negative integer
 */
const drawIndex = (block: number, salt: Salt): number => block * 3 + salt;

/**
 * Position of the highest bucket a key lands on within block [2^block, 2^(block+1)).
 *
 * The top `block` bits of the 64 bit random value for the block. The high word is drawn from the second lane,
 * and the low word from the first lane only for blocks above 2^32, so ranges up to 2^33 draw a single word.
 * One 32 bit seed would only reach 2^32 positions within a larger block.
 *
 * @param hash - lanes from {@link hashKey}
 * @param block - index of the power of 2 block, 0 to 47
 * @returns integer between 0 and 2^block - 1
 */
export const blockOffset = (hash: KeyHash, block: number): number => {
    // Block 0 holds a single bucket, and `>>> 32` would not shift at all
    if (block === 0) {
        return 0;
    }
    const index = drawIndex(block, Salt.TOP);
    const hi = mix32(hash[1], index);
    return block <= 32
        ? hi >>> (32 - block)
        : hi * 2 ** (block - 32) + (mix32(hash[0], index) >>> (64 - block));
};

/**
 * Uniform value in [0, 1) with 53 bits of precision, derived from a block and salt.
 *
 * Built from the top 53 bits of the 64 bit random value, so that it is exact in IEEE-754 binary64,
 * and reproducible in any language.
 *
 * @param hash - lanes from {@link hashKey}
 * @param block - index of the power of 2 block
 * @param salt - distinguishes values for the same block
 * @returns value in [0, 1)
 */
export const uniform = (hash: KeyHash, block: number, salt: Salt): number => {
    const index = drawIndex(block, salt);
    return (mix32(hash[1], index) * 2 ** 21 + (mix32(hash[0], index) >>> 11)) / 2 ** 53;
};

/**
 * Number of bits needed to represent a non-negative safe integer.
 *
 * `Math.clz32` only sees the low 32 bits, so larger values count the high word separately.
 * `Math.log2` is avoided, as it can round `2^k - 1` up to `k`.
 *
 * @param x - non-negative integer
 * @returns 0 for 0, else 1 + index of the highest set bit
 */
export const bitLength = (x: number): number =>
    x >= 2 ** 32 ? 64 - Math.clz32(Math.floor(x / 2 ** 32)) : 32 - Math.clz32(x);
