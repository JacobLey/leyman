import type { Encryption, Hash, Uint8ArrayBuffer } from './types.js';
import { fixBytes } from './bytes-length.js';
import { encryptionMeta } from './size-meta.js';
import { Algorithms } from './types.js';

/**
 * Fit a secret (after hashing) to the key size of the encryption algorithm.
 *
 * CBC and CTR prepend 0s to a short secret and strip the start of a long one, as they always have,
 * so existing data stays readable.
 *
 * GCM never pads, which would silently weaken the key. A raw secret must be exactly the key size,
 * and a hash must be at least as long (longer hashes are trimmed, which keeps their strength).
 *
 * @param secret - secret, hashed unless `hash` is `'raw'`
 * @param encryption - encryption algorithm
 * @param hash - hash algorithm applied to the secret
 * @returns key of the algorithm's size
 * @throws {RangeError} for GCM, when the secret does not fit the key size
 */
export const fitKey = (
    secret: Uint8ArrayBuffer,
    encryption: Encryption,
    hash: Hash
): Uint8ArrayBuffer => {
    const { secret: bytes } = encryptionMeta(encryption);

    if (encryption.mode === 'GCM') {
        if (hash === Algorithms.RAW && secret.byteLength !== bytes) {
            throw new RangeError(
                `AES-${encryption.size}-GCM needs a ${bytes} byte key, got ${secret.byteLength}. ` +
                    'Derive one with `deriveKey`, or hash the secret.'
            );
        }
        if (secret.byteLength < bytes) {
            throw new RangeError(
                `AES-${encryption.size}-GCM needs a ${bytes} byte key, ` +
                    `but the hash is only ${secret.byteLength} bytes. Use a longer hash.`
            );
        }
    }

    return fixBytes(secret, bytes);
};
