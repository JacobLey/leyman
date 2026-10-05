import type { Curve, Encryption } from './types.js';

const BITS_PER_BYTE = 8;
const BYTE_PAIR = BITS_PER_BYTE * 2;
/**
 * GCM uses a 96 bit IV, the size its specification recommends.
 */
const GCM_IV_BYTES = 12;
/**
 * Size of a GCM authentication tag, appended to the encrypted content.
 */
export const GCM_TAG_BYTES = 16;

/**
 * Get input/output sizes for encryption.
 * Sizes are in bytes (e.g. size of 32 -> 256 bits).
 *
 * @param encryption - encryption algorithm
 * @returns size metadata
 */
export const encryptionMeta = (
    encryption: Encryption
): {
    secret: number;
    iv: number;
} => ({
    secret: encryption.size / BITS_PER_BYTE,
    iv: encryption.mode === 'GCM' ? GCM_IV_BYTES : BYTE_PAIR,
});

export const eccMeta = (
    curve: Curve
): {
    bytes: number;
} => {
    const bytePairs = Number.parseInt(curve.slice(1), 10) / BYTE_PAIR;
    return { bytes: Math.ceil(bytePairs) * 2 };
};
