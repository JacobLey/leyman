import { bucket, hashKey as hashKeyInWasm } from '@leyman/constant-consistent-hash-rust';

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
     * @default 0
     */
    readonly seed?: number;
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
 * @param key - value to be hashed (as UTF-8)
 * @param [options] - optional
 * @param [options.seed] - selects an independent hash function, defaults to 0
 * @returns two unsigned 32 bit integers
 * @throws {RangeError} when seed is out of bounds
 */
export const hashKey = (key: string, options?: ConsistentHashOptions): [number, number] => {
    const [a, b] = hashKeyInWasm(key, parseSeed(options));
    return [a!, b!];
};

/**
 * Maps a key to a bucket in [0, range), in constant time. See `constant-consistent-hash`, which returns the same buckets.
 *
 * @param key - value to be hashed (as UTF-8)
 * @param range - number of buckets, integer between 1 and 2^48
 * @param [options] - optional
 * @param [options.seed] - selects an independent hash function, defaults to 0
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
    return Number(bucket(key, BigInt(range), parseSeed(options)));
};
