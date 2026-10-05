import type { Encryption } from '../lib/types.js';
import type * as Encrypt from './types.js';
import { decode } from '#encode';
import { hash } from '#hash';
import { randomBytes } from '#random';
import { decodeAdditionalData } from '../lib/additional-data.js';
import { fitKey } from '../lib/fit-key.js';
import { encryptionMeta } from '../lib/size-meta.js';
import { defaultEncryption, defaultHash } from '../lib/types.js';

const { crypto } = globalThis;

/**
 * Bits of the CTR counter block that increment, as opposed to a fixed nonce.
 * All 128 matches `node:crypto`, which carries across the entire block.
 */
const CTR_COUNTER_BITS = 128;

const encryptionToAlgorithm = (encryption: Encryption): { name: string; length: number } => ({
    name: `${encryption.cipher}-${encryption.mode}`,
    // Only read by CTR
    length: CTR_COUNTER_BITS,
});

export const encrypt: (typeof Encrypt)['encrypt'] = async (
    { data, secret },
    { encryption = defaultEncryption, hash: hashAlgorithm = defaultHash, additionalData } = {}
) => {
    const sizes = encryptionMeta(encryption);
    const algorithm = encryptionToAlgorithm(encryption);
    const aad = decodeAdditionalData(encryption, additionalData);

    const [iv, secretHash] = await Promise.all([
        randomBytes(sizes.iv),
        hash(secret, hashAlgorithm),
    ]);

    const key = await crypto.subtle.importKey(
        'raw',
        fitKey(secretHash, encryption, hashAlgorithm),
        algorithm.name,
        false,
        ['encrypt']
    );

    const encrypted = await crypto.subtle.encrypt(
        {
            ...algorithm,
            counter: iv,
            iv,
            ...(aad && { additionalData: aad }),
        },
        key,
        decode(data)
    );

    return {
        encrypted: new Uint8Array(encrypted),
        iv,
    };
};
export const decrypt: (typeof Encrypt)['decrypt'] = async (
    { encrypted, iv, secret },
    { encryption = defaultEncryption, hash: hashAlgorithm = defaultHash, additionalData } = {}
) => {
    const algorithm = encryptionToAlgorithm(encryption);
    const aad = decodeAdditionalData(encryption, additionalData);

    const hashedSecret = await hash(secret, hashAlgorithm);

    const key = await crypto.subtle.importKey(
        'raw',
        fitKey(hashedSecret, encryption, hashAlgorithm),
        algorithm.name,
        false,
        ['decrypt']
    );

    const decodedIv = decode(iv);

    const decrypted = await crypto.subtle.decrypt(
        {
            ...algorithm,
            counter: decodedIv,
            iv: decodedIv,
            ...(aad && { additionalData: aad }),
        },
        key,
        decode(encrypted)
    );

    return new Uint8Array(decrypted);
};
