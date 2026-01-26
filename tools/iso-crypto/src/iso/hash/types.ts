import type { Hash, InputText, Uint8ArrayBuffer } from '../lib/types.js';

/**
 * Hash provided text with the given algorithm.
 *
 * @param input - text to hash
 * @param [algorithm] - hash algorithm to use, defaults to SHA256
 * @returns hashed output
 */
export declare const hash: (
    /**
     * Text to hash.
     */
    input: InputText,
    /**
     * Hash algorithm to use, defaults to SHA256.
     */
    algorithm?: Hash
) => Promise<Uint8ArrayBuffer>;
