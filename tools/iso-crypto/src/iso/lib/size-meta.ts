import type { Curve, Encryption } from './types.js';

/**
 * Get input/output sizes for encryption.
 * Sizes are in bytes (e.g. size of 32 -> 256 bits).
 *
 * @param {Encryption} encryption - encryption algorithm
 * @returns {object} size metadata
 */
export const encryptionMeta = (
    encryption: Encryption
): {
    secret: number;
    iv: number;
} => ({
    secret: encryption.size / 8,
    iv: 16,
});

export const eccMeta = (
    curve: Curve
): {
    bytes: number;
} => {
    const bytePairs = Number.parseInt(curve.slice(1), 10) / 16;
    return { bytes: Math.ceil(bytePairs) * 2 };
};
