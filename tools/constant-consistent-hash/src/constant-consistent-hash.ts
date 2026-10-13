import { hashKey, keyWord } from './lib/hash-key.js';
import { bitLength, Salt, uniform } from './lib/random.js';

const WORD_BITS = 32;
// The key's hash provides 48 bits for selecting blocks, one per power of 2
const BLOCK_BITS = 48;
const MAX_RANGE = 2 ** BLOCK_BITS;
const MAX_SEED = 2 ** WORD_BITS - 1;

/**
 * Which word of the key's hash is used for each purpose.
 */
enum Word {
    BITS_HIGH = 0,
    BITS_LOW = 1,
    TOP = 2,
    PAIR = 3,
    SECOND = 4,
}

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
 * Uniform value in [0, m) for a power of 2 m.
 *
 * Each block [h, 2h) is non-empty (holds the highest bucket the key lands on) with probability 1/2,
 * which is exactly one random bit, so the highest set bit picks the highest non-empty block.
 * The value is unchanged for larger powers of 2, unless it moves to one of the new blocks.
 *
 * @param bits - 48 random bits of the key's hash, one per block
 * @param seed - 32 bit word of the key's hash, for the position within a block
 * @param m - power of 2
 * @returns value between 0 and m-1
 */
const blockHash = (bits: number, seed: number, m: number): number => {
    const blockBits = bits % m;
    if (blockBits === 0) {
        return 0;
    }
    const block = bitLength(blockBits) - 1;
    const h = 2 ** block;
    return h + Math.floor(uniform(seed, block, Salt.TOP) * h);
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
 * consistentHash('00000000-0000-4000-8000-000000000000', 7); // 6
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
    const seed = options?.seed ?? 0;
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > MAX_SEED) {
        throw new RangeError(`seed must be an integer between 0 and 2^32 - 1, received ${seed}`);
    }

    const hash = hashKey(key, seed);
    const bits =
        (keyWord(hash, Word.BITS_HIGH) % 2 ** (BLOCK_BITS - WORD_BITS)) * 2 ** WORD_BITS +
        keyWord(hash, Word.BITS_LOW);
    const topSeed = keyWord(hash, Word.TOP);

    const power = bitLength(range - 1);
    const top = blockHash(bits, topSeed, 2 ** power);
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

    if (uniform(keyWord(hash, Word.PAIR), block, Salt.PAIR) * top * (top + 1) < 2 * h * (top - h)) {
        const second =
            h + Math.floor(uniform(keyWord(hash, Word.SECOND), block, Salt.SECOND) * (top - h));
        if (second < range) {
            return second;
        }
    }

    // Nothing in the top block is below range, so fall back to the lower blocks
    return blockHash(bits, topSeed, h);
};
