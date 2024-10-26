import type { Curve, Encryption } from './types.js';

const BITS_PER_BYTE = 8;
const BYTE_PAIR = BITS_PER_BYTE * 2;

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
    iv: BYTE_PAIR,
});

export const eccMeta = (
    curve: Curve
): {
    bytes: number;
} => {
    const bytePairs = Number.parseInt(curve.slice(1), 10) / BYTE_PAIR;
    return { bytes: Math.ceil(bytePairs) * 2 };
};
