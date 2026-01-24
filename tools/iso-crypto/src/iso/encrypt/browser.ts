import type { webcrypto } from 'node:crypto';
import type { Encryption } from '../lib/types.js';
import type * as Encrypt from './types.js';
import { decode } from '#encode';
import { hash } from '#hash';
import { randomBytes } from '#random';
import { fixBytes } from '../lib/bytes-length.js';
import { encryptionMeta } from '../lib/size-meta.js';
import { defaultEncryption, defaultHash } from '../lib/types.js';

const { crypto } = globalThis;

const encryptionToAlgorithm = (encryption: Encryption): webcrypto.AesDerivedKeyParams => ({
    name: `${encryption.cipher}-${encryption.mode}`,
    length: encryption.size / 2,
});

export const encrypt: (typeof Encrypt)['encrypt'] = async (
    { data, secret },
    { encryption = defaultEncryption, hash: hashAlgorithm = defaultHash } = {}
) => {
    const sizes = encryptionMeta(encryption);
    const algorithm = encryptionToAlgorithm(encryption);

    const [iv, secretHash] = await Promise.all([
        randomBytes(sizes.iv),
        hash(secret, hashAlgorithm),
    ]);

    const key = await crypto.subtle.importKey(
        'raw',
        fixBytes(secretHash, sizes.secret),
        algorithm.name,
        false,
        ['encrypt']
    );

    const encrypted = await crypto.subtle.encrypt(
        {
            ...algorithm,
            counter: iv,
            iv,
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
    { encryption = defaultEncryption, hash: hashAlgorithm = defaultHash } = {}
) => {
    const sizes = encryptionMeta(encryption);
    const algorithm = encryptionToAlgorithm(encryption);

    const hashedSecret = await hash(secret, hashAlgorithm);

    const key = await crypto.subtle.importKey(
        'raw',
        fixBytes(hashedSecret, sizes.secret),
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
        },
        key,
        decode(encrypted)
    );

    return new Uint8Array(decrypted);
};
