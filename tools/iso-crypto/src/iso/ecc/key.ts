import type { Curve, Encryption, Uint8ArrayBuffer } from '../lib/types.js';
import { deriveKey } from '#derive';
import { defaultHash } from '../lib/types.js';

/**
 * Turn an ECDH shared secret into the key for symmetric encryption.
 *
 * GCM derives the key with HKDF-SHA256 (no salt), as the shared secret is an EC point coordinate rather
 * than uniformly random bytes. The `info` binds the key to the curve and cipher, so the same key pair
 * never produces the same key for two algorithms.
 *
 * CBC and CTR use the shared secret directly, as they always have, so existing data stays readable.
 *
 * @param secret - ECDH shared secret
 * @param curve - curve the secret was computed on
 * @param encryption - encryption algorithm the key is for
 * @returns key for `encrypt`/`decrypt` with `{ hash: 'raw' }`
 */
export const eccKey = async (
    secret: Uint8ArrayBuffer,
    curve: Curve,
    encryption: Encryption
): Promise<Uint8ArrayBuffer> => {
    if (encryption.mode !== 'GCM') {
        return secret;
    }
    return deriveKey(
        { secret, salt: new Uint8Array(0) },
        {
            algorithm: 'HKDF',
            hash: defaultHash,
            size: encryption.size,
            info: `iso-crypto ECDH ${curve} ${encryption.cipher}-${encryption.size}-${encryption.mode}`,
        }
    );
};
