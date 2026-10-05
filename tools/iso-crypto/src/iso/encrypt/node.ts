import type { CipherGCM, DecipherGCM } from 'node:crypto';
import type { Encryption, Uint8ArrayBuffer } from '../lib/types.js';
import type * as Encrypt from './types.js';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { decode } from '#encode';
import { hash } from '#hash';
import { randomBytes } from '#random';
import { fitKey } from '../lib/fit-key.js';
import { encryptionMeta, GCM_TAG_BYTES } from '../lib/size-meta.js';
import { defaultEncryption, defaultHash } from '../lib/types.js';

const encryptionToCipher = (encryption: Encryption): string =>
    `${encryption.cipher}-${encryption.size}-${encryption.mode}`;

const mergeUint8Array = (a: Uint8ArrayBuffer, b: Uint8ArrayBuffer): Uint8ArrayBuffer => {
    const merged = new Uint8Array(a.length + b.length);

    merged.set(a, 0);
    merged.set(b, a.length);

    return merged;
};

export const encrypt: (typeof Encrypt)['encrypt'] = async (
    { data, secret },
    { encryption = defaultEncryption, hash: hashAlgorithm = defaultHash } = {}
) => {
    const sizes = encryptionMeta(encryption);

    const [iv, secretHash] = await Promise.all([
        randomBytes(sizes.iv),
        hash(secret, hashAlgorithm),
    ]);

    const cipher = createCipheriv(
        encryptionToCipher(encryption),
        fitKey(secretHash, encryption, hashAlgorithm),
        iv
    );

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
    { encryption = defaultEncryption, hash: hashAlgorithm = defaultHash } = {}
) => {
    const hashedSecret = await hash(secret, hashAlgorithm);

    const decipher = createDecipheriv(
        encryptionToCipher(encryption),
        fitKey(hashedSecret, encryption, hashAlgorithm),
        decode(iv)
    );

    let content = decode(encrypted);
    if (encryption.mode === 'GCM') {
        (decipher as DecipherGCM).setAuthTag(content.subarray(-GCM_TAG_BYTES));
        content = content.subarray(0, -GCM_TAG_BYTES) as Uint8ArrayBuffer;
    }

    // Throws for GCM if the content or tag was altered
    return mergeUint8Array(decipher.update(content), decipher.final());
};
