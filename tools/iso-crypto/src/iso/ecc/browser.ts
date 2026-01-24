import type { webcrypto } from 'node:crypto';
import type { Point } from '../lib/math.js';
import type { Curve, InputText } from '../lib/types.js';
import type * as Ecc from './types.js';
import { decode, encode } from '#encode';
import { decrypt, encrypt } from '#encrypt';
import { padBytes } from '../lib/bytes-length.js';
import { curves, derivePublicKey } from '../lib/math.js';
import { eccMeta } from '../lib/size-meta.js';
import { Algorithms, defaultCurve, defaultEncryption, Encodings } from '../lib/types.js';
import { decompressEccPublicKey } from './compression.js';

const BITS_PER_BYTE = 8;
const HEX_SIZE = 16;

const { crypto } = globalThis;

const curveToKeyParams = (curve: Curve): webcrypto.EcKeyGenParams => ({
    name: 'ECDH',
    namedCurve: curve.replace('p', 'P-'),
});

export const generateEccPrivateKey: (typeof Ecc)['generateEccPrivateKey'] = async (
    curve = defaultCurve
) => {
    const ecdh = await crypto.subtle.generateKey(curveToKeyParams(curve), true, ['deriveKey']);
    const key = await crypto.subtle.exportKey('jwk', ecdh.privateKey);
    return padBytes(decode({ text: key.d!, encoding: Encodings.BASE64URL }), eccMeta(curve).bytes);
};

const getPublicKey = (privateKey: InputText, curve: Curve): Point => {
    const hex = encode(decode(privateKey), Encodings.HEX);

    return derivePublicKey(BigInt(`0x${hex}`), curves[curve]);
};
const bigIntToBase64Url = (x: bigint, bytes: number): string =>
    encode(
        padBytes(decode({ text: x.toString(HEX_SIZE), encoding: Encodings.HEX }), bytes),
        Encodings.BASE64URL
    );
const derivePublicKeyBase64 = (privateKey: InputText, curve: Curve): { x: string; y: string } => {
    const { x, y } = getPublicKey(privateKey, curve);
    const { bytes } = eccMeta(curve);
    return {
        x: bigIntToBase64Url(x, bytes),
        y: bigIntToBase64Url(y, bytes),
    };
};

export const generateEccPublicKey: (typeof Ecc)['generateEccPublicKey'] = (
    privateKey,
    curve = defaultCurve
) => {
    const { x, y } = getPublicKey(privateKey, curve);
    const { bytes } = eccMeta(curve);

    return new Uint8Array([
        // eslint-disable-next-line no-bitwise
        2 + Number(y & 1n),
        ...padBytes(decode({ text: x.toString(HEX_SIZE), encoding: Encodings.HEX }), bytes),
    ]);
};

const eccSecret = async ({
    curve,
    privateKey,
    publicKey,
}: {
    curve: Curve;
    publicKey: InputText;
    privateKey: InputText;
}): Promise<{
    secret: Uint8Array;
    privateEc: CryptoKey;
}> => {
    const bufferPrivateKey = decode(privateKey);
    const curveParams = curveToKeyParams(curve);

    const [privateEc, publicEc] = await Promise.all([
        crypto.subtle.importKey(
            'jwk',
            {
                crv: curveParams.namedCurve,
                kty: 'EC',
                d: encode(bufferPrivateKey, Encodings.BASE64URL),
                ...derivePublicKeyBase64(bufferPrivateKey, curve),
            },
            curveParams,
            true,
            ['deriveKey']
        ),
        crypto.subtle.importKey(
            'raw',
            decompressEccPublicKey(publicKey, curve),
            curveParams,
            true,
            []
        ),
    ]);

    const { bytes } = eccMeta(curve);
    const derivedSecret = await crypto.subtle.deriveKey(
        {
            name: 'ECDH',
            public: publicEc,
        },
        privateEc,
        {
            name: 'HMAC',
            hash: 'SHA-256',
            length: bytes * BITS_PER_BYTE,
        },
        true,
        ['sign']
    );
    const secret = await crypto.subtle.exportKey('raw', derivedSecret);

    return {
        secret: new Uint8Array(secret),
        privateEc,
    };
};

export const eccEncrypt: (typeof Ecc)['eccEncrypt'] = async (
    { data, publicKey, privateKey },
    { curve = defaultCurve, encryption = defaultEncryption } = {}
) => {
    const secretKey = await eccSecret({ curve, privateKey, publicKey });

    const [encrypted, jwk] = await Promise.all([
        encrypt(
            {
                data,
                secret: secretKey.secret,
            },
            { encryption, hash: Algorithms.RAW }
        ),
        crypto.subtle.exportKey('jwk', secretKey.privateEc),
    ]);

    const odd =
        // eslint-disable-next-line no-bitwise
        decode({ text: jwk.y!, encoding: Encodings.BASE64URL }).reverse()[0]! & 1;

    const publicX = decode({ text: jwk.x!, encoding: Encodings.BASE64URL });
    const { bytes } = eccMeta(curve);

    return {
        ...encrypted,
        publicKey: new Uint8Array([2 + odd, ...padBytes(publicX, bytes)]),
    };
};
export const eccDecrypt: (typeof Ecc)['eccDecrypt'] = async (
    { encrypted, iv, publicKey, privateKey },
    { curve = defaultCurve, encryption = defaultEncryption } = {}
) => {
    const { secret } = await eccSecret({ curve, privateKey, publicKey });

    return decrypt(
        {
            encrypted,
            iv,
            secret,
        },
        { encryption, hash: Algorithms.RAW }
    );
};
