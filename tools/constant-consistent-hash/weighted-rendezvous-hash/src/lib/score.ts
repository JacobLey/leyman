/* eslint-disable @typescript-eslint/no-magic-numbers, no-bitwise -- Hashing is defined by its bit operations and constants */

import type { KeyHash } from 'constant-consistent-hash';

/**
 * 32 bit integer hash (lowbias32) of a seed offset by an index.
 *
 * @param seed - 32 bit integer
 * @param index - 32 bit integer
 * @returns unsigned 32 bit integer
 */
const mix32 = (seed: number, index: number): number => {
    let x = seed + Math.imul(index + 1, 0x9e3779b9);
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
};

/**
 * Uniform 53 bit integer for a key and a node, independent between nodes.
 *
 * Words are chained through mix32 rather than combined with xor, which would give
 * two nodes swapped values for some pairs of keys.
 *
 * Takes the words of the name's hash separately, so the lookup loop reads names from a typed array rather than tuples.
 *
 * @param key - `hashKey` of the key
 * @param name0 - low word of the node name's hash
 * @param name1 - high word of the node name's hash
 * @returns integer between 0 and 2^53 - 1
 */
export const draw = (key: KeyHash, name0: number, name1: number): number => {
    const hi = mix32(mix32(key[0], name0) ^ key[1], name1);
    const lo = mix32(hi ^ name0, key[0]);
    return hi * 2 ** 21 + (lo >>> 11);
};

/**
 * Weighted rendezvous score of a draw: lower wins.
 *
 * An exponential random value divided by the node's size, so a node wins with probability size / total,
 * and scaling every size by the same factor never changes the winner.
 * Within nodes of one size, the highest draw always has the lowest score.
 *
 * Uses `Math.log`, which is not correctly rounded in every language. A portable fixed point logarithm
 * is needed before this is specified for other languages.
 *
 * @param value - result of {@link draw}
 * @param size - positive size of the node
 * @returns positive score
 */
export const score = (value: number, size: number): number =>
    -Math.log((value + 1) / 2 ** 53) / size;
