import { createCipheriv, createDecipheriv } from 'node:crypto';
import { decode } from '#encode';
import { hash } from '#hash';
import { randomBytes } from '#random';
import { fixBytes } from '../lib/bytes-length.js';
import { encryptionMeta } from '../lib/size-meta.js';
import {
    defaultEncryption,
    defaultHash,
    type Encryption,
} from '../lib/types.js';
import type * as Encrypt from './types.js';

const encryptionToCipher = (encryption: Encryption): string =>
    `${encryption.cipher}-${encryption.size}-${encryption.mode}`;

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
        fixBytes(secretHash, sizes.secret),
        iv
    );

    return {
        encrypted: Buffer.concat([cipher.update(decode(data)), cipher.final()]),
        iv,
    } as const;
};
export const decrypt: (typeof Encrypt)['decrypt'] = async (
    { encrypted, iv, secret },
    { encryption = defaultEncryption, hash: hashAlgorithm = defaultHash } = {}
) => {
    const sizes = encryptionMeta(encryption);

    const hashedSecret = await hash(secret, hashAlgorithm);

    const decipher = createDecipheriv(
        encryptionToCipher(encryption),
        fixBytes(hashedSecret, sizes.secret),
        decode(iv)
    );

    return Buffer.concat([
        decipher.update(decode(encrypted)),
        decipher.final(),
    ]);
};
