import type { CipherGCM, CipherGCMOptions, DecipherGCM } from 'node:crypto';
import type { Encryption, Uint8ArrayBuffer } from '#internal/iso/lib/types.js';
import type * as Encrypt from './types.js';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { decode } from '#encode';
import { hash } from '#hash';
import { decodeAdditionalData } from '#internal/iso/lib/additional-data.js';
import { fitKey } from '#internal/iso/lib/fit-key.js';
import { encryptionMeta, GCM_TAG_BYTES } from '#internal/iso/lib/size-meta.js';
import { defaultEncryption, defaultHash } from '#internal/iso/lib/types.js';
import { randomBytes } from '#random';

const encryptionToCipher = (encryption: Encryption): string =>
    `${encryption.cipher}-${encryption.size}-${encryption.mode}`;

const mergeUint8Array = (a: Uint8ArrayBuffer, b: Uint8ArrayBuffer): Uint8ArrayBuffer => {
    const merged = new Uint8Array(a.length + b.length);

    merged.set(a, 0);
    merged.set(b, a.length);

    return merged;
};

/**
 * Fixes the GCM tag at the full 16 bytes Web Crypto uses by default. Without it,
 * Node 22 and 24 accept a truncated 4, 8 or 12 byte tag in `setAuthTag`, which
 * authenticates with far less security than the browser build gives.
 *
 * @param encryption - the encryption in use
 * @returns cipher options pinning the tag length for GCM, otherwise none
 */
const gcmOptions = (encryption: Encryption): CipherGCMOptions | undefined =>
    encryption.mode === 'GCM' ? { authTagLength: GCM_TAG_BYTES } : undefined;

export const encrypt: (typeof Encrypt)['encrypt'] = async (
    { data, secret },
    { encryption = defaultEncryption, hash: hashAlgorithm = defaultHash, additionalData } = {}
) => {
    const sizes = encryptionMeta(encryption);
    const aad = decodeAdditionalData(encryption, additionalData);

    const [iv, secretHash] = await Promise.all([
        randomBytes(sizes.iv),
        hash(secret, hashAlgorithm),
    ]);

    const cipher = createCipheriv(
        encryptionToCipher(encryption),
        fitKey(secretHash, encryption, hashAlgorithm),
        iv,
        gcmOptions(encryption)
    );

    if (aad) {
        (cipher as CipherGCM).setAAD(aad);
    }
    const encrypted = mergeUint8Array(cipher.update(decode(data)), cipher.final());

    return {
        // Matches Web Crypto, which appends the authentication tag to the encrypted content
        encrypted:
            encryption.mode === 'GCM'
                ? mergeUint8Array(encrypted, (cipher as CipherGCM).getAuthTag())
                : encrypted,
        iv,
    } as const;
};
export const decrypt: (typeof Encrypt)['decrypt'] = async (
    { encrypted, iv, secret },
    { encryption = defaultEncryption, hash: hashAlgorithm = defaultHash, additionalData } = {}
) => {
    const aad = decodeAdditionalData(encryption, additionalData);
    const hashedSecret = await hash(secret, hashAlgorithm);

    const decipher = createDecipheriv(
        encryptionToCipher(encryption),
        fitKey(hashedSecret, encryption, hashAlgorithm),
        decode(iv),
        gcmOptions(encryption)
    );

    let content = decode(encrypted);
    if (encryption.mode === 'GCM') {
        if (content.length < GCM_TAG_BYTES) {
            // What Web Crypto rejects with, so both builds fail the same way
            throw new DOMException(
                `AES-GCM content is shorter than its ${GCM_TAG_BYTES} byte authentication tag`,
                'OperationError'
            );
        }
        if (aad) {
            (decipher as DecipherGCM).setAAD(aad);
        }
        (decipher as DecipherGCM).setAuthTag(content.subarray(-GCM_TAG_BYTES));
        content = content.subarray(0, -GCM_TAG_BYTES) as Uint8ArrayBuffer;
    }

    // Throws for GCM if the content or tag was altered
    return mergeUint8Array(decipher.update(content), decipher.final());
};
