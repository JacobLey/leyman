import type { KeyHash } from './lib/hash-key.js';
import { hashKey as hashLanes } from './lib/hash-key.js';
import { bitLength, blockOffset, highestBlock, Salt, uniform } from './lib/random.js';

export type { KeyHash } from './lib/hash-key.js';

// The key's hash provides 48 bits for selecting blocks, one per power of 2
const BLOCK_BITS = 48;
const SEED_BITS = 32;
const MAX_RANGE = 2 ** BLOCK_BITS;
const MAX_SEED = 2 ** SEED_BITS - 1;

/**
 * Options for {@link consistentHash}.
 */
export interface ConsistentHashOptions {
    /**
     * Unsigned 32 bit integer that selects an independent hash function.
     *
     * Use a different seed per layer when hashing the same keys more than once
     * (e.g. shard, then node within a shard), so the layers are not correlated.
     * Not a security measure: it does not prevent crafted keys from targeting a bucket.
     *
     * @default 0
     */
    seed?: number;
}

/**
 * Seed from options, validated.
 *
 * @param [options] - optional
 * @returns unsigned 32 bit integer, 0 by default
 * @throws {RangeError} when the seed is out of bounds
 */
const parseSeed = (options?: ConsistentHashOptions): number => {
    const seed = options?.seed ?? 0;
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > MAX_SEED) {
        throw new RangeError(`seed must be an integer between 0 and 2^32 - 1, received ${seed}`);
    }
    return seed;
};

/**
 * Hash of a key: two independent unsigned 32 bit words, from its UTF-8 bytes.
 *
 * The same hash `consistentHash` places keys with, specified in SPEC.md, so other languages compute the same words.
 * For building other hashing schemes on, such as rendezvous hashing. Not cryptographic.
 *
 * @example
 * hashKey('00000000-0000-4000-8000-000000000000'); // [865118427, 3574204183]
 *
 * @param key - value to be hashed (as UTF-8)
 * @param [options] - optional
 * @param [options.seed=0] - selects an independent hash function
 * @returns two unsigned 32 bit integers
 * @throws {RangeError} when seed is out of bounds
 */
export const hashKey = (key: string, options?: ConsistentHashOptions): KeyHash =>
    hashLanes(key, parseSeed(options));

/**
 * Uniform value in [0, 2^power) that only changes as power grows if it moves to one of the new blocks.
 *
 * Each block [h, 2h) is non-empty (holds the highest bucket the key lands on) with probability 1/2,
 * which is exactly one random bit, so the highest set bit picks the highest non-empty block.
 *
 * @param hash - lanes from {@link hashKey}
 * @param power - log2 of the power of 2 range
 * @returns value between 0 and 2^power - 1
 */
const blockHash = (hash: KeyHash, power: number): number => {
    const block = highestBlock(hash, power);
    return block < 0 ? 0 : 2 ** block + blockOffset(hash, block);
};

/**
 * Maps a key to a bucket in [0, range), in constant time.
 *
 * Every bucket is equally likely. When range grows by one, a key either keeps
 * its bucket, or moves to the new bucket (range - 1), so only 1/range of keys move.
 * Shrinking the range is the reverse: only keys in the removed bucket move.
 *
 * The algorithm is described in WHY-CONSTANT-CONSISTENT-HASH.md,
 * and specified for other languages in SPEC.md.
 *
 * @example
 * consistentHash('00000000-0000-4000-8000-000000000000', 7); // 2
 *
 * @param key - value to be hashed (as UTF-8)
 * @param range - number of buckets, integer between 1 and 2^48
 * @param [options] - optional
 * @param [options.seed=0] - selects an independent hash function
 * @returns bucket between 0 and range-1
 * @throws {RangeError} when range or seed is out of bounds
 */
export const consistentHash = (
    key: string,
    range: number,
    options?: ConsistentHashOptions
): number => {
    if (!Number.isSafeInteger(range) || range < 1 || range > MAX_RANGE) {
        throw new RangeError(`range must be an integer between 1 and 2^48, received ${range}`);
    }
    const hash = hashLanes(key, parseSeed(options));
    const power = bitLength(range - 1);
    const top = blockHash(hash, power);
    if (top < range) {
        return top;
    }

    // `top` is in [range, m), so the top block [h, m) is non-empty, and `top` is its highest bucket.
    // Within a block, a key needs to land on at most 2 buckets to keep buckets balanced
    // with minimal disruption, given the highest bucket M, the second exists with probability
    // 2h(M - h) / M(M + 1), and is uniform in [h, M).
    // This is what replaces the loop of Jump/Power consistent hashing, see WHY-CONSTANT-CONSISTENT-HASH.md.
    const block = power - 1;
    const h = 2 ** block;

    if (uniform(hash, block, Salt.PAIR) * top * (top + 1) < 2 * h * (top - h)) {
        const second = h + Math.floor(uniform(hash, block, Salt.SECOND) * (top - h));
        if (second < range) {
            return second;
        }
    }

    // Nothing in the top block is below range, so fall back to the lower blocks
    return blockHash(hash, block);
};
