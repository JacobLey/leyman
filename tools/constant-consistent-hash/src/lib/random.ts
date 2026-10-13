/* eslint-disable @typescript-eslint/no-magic-numbers, no-bitwise -- Hashing is defined by its bit operations and constants */

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
 * Uniform value in [0, 1) with 53 bits of precision, derived from a seed and block.
 *
 * Built from two 32 bit words so that it is exact in IEEE-754 binary64,
 * and reproducible in any language.
 *
 * @param seed - 32 bit word of the key's hash
 * @param block - index of the power of 2 block
 * @param salt - distinguishes values for the same block
 * @returns value in [0, 1)
 */
export const uniform = (seed: number, block: number, salt: Salt): number => {
    const index = block * 6 + salt * 2;
    const hi = mix32(seed, index);
    const lo = mix32(seed, index + 1);
    return (hi * 2 ** 21 + (lo >>> 11)) / 2 ** 53;
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
