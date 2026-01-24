import type { ECDH } from 'node:crypto';
import type { Curve } from '../lib/types.js';
import type * as Ecc from './types.js';
import { createECDH } from 'node:crypto';
import { decode } from '#encode';
import { decrypt, encrypt } from '#encrypt';
import { padBytes } from '../lib/bytes-length.js';
import { eccMeta } from '../lib/size-meta.js';
import { Algorithms, Curves, defaultCurve, defaultEncryption } from '../lib/types.js';

const getECDH = (curve: Curve): ECDH =>
    createECDH(curve === Curves.P256 ? 'prime256v1' : `sec${curve}r1`);

export const generateEccPrivateKey: (typeof Ecc)['generateEccPrivateKey'] = async (
    curve = defaultCurve
): Promise<Uint8Array> => {
    const ecdh = getECDH(curve);
    const { bytes } = eccMeta(curve);
    ecdh.generateKeys();
    return padBytes(ecdh.getPrivateKey(), bytes);
};
export const generateEccPublicKey: (typeof Ecc)['generateEccPublicKey'] = (
    privateKey,
    curve = defaultCurve
) => {
    const ecdh = getECDH(curve);
    ecdh.setPrivateKey(decode(privateKey));
    return ecdh.getPublicKey(null, 'compressed');
};

export const eccEncrypt: (typeof Ecc)['eccEncrypt'] = async (
    { data, publicKey, privateKey },
    { curve = defaultCurve, encryption = defaultEncryption } = {}
) => {
    const ecdh = getECDH(curve);
    ecdh.setPrivateKey(decode(privateKey));

    const encrypted = await encrypt(
        {
            data,
            secret: ecdh.computeSecret(decode(publicKey)),
        },
        { encryption, hash: Algorithms.RAW }
    );

    return {
        ...encrypted,
        publicKey: ecdh.getPublicKey(null, 'compressed'),
    };
};
export const eccDecrypt: (typeof Ecc)['eccDecrypt'] = async (
    { encrypted, iv, publicKey, privateKey },
    { curve = defaultCurve, encryption = defaultEncryption } = {}
) => {
    const ecdh = getECDH(curve);
    ecdh.setPrivateKey(decode(privateKey));

    return decrypt(
        {
            encrypted,
            iv,
            secret: ecdh.computeSecret(decode(publicKey)),
        },
        { encryption, hash: Algorithms.RAW }
    );
};
