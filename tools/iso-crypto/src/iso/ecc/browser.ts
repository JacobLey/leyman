import crypto from '#crypto';
import { decode, encode } from '#encode';
import { decrypt, encrypt } from '#encrypt';
import { padBytes } from '../lib/bytes-length.js';
import { curves, derivePublicKey, type Point } from '../lib/math.js';
import { eccMeta } from '../lib/size-meta.js';
import { type Curve, defaultCurve, defaultEncryption, type InputText } from '../lib/types.js';
import { decompressEccPublicKey } from './compression.js';
import type * as Ecc from './types.js';

const curveToKeyParams = (curve: Curve): crypto.EcKeyGenParams => ({
    name: 'ECDH',
    namedCurve: curve.replace('p', 'P-'),
});

export const generateEccPrivateKey: typeof Ecc['generateEccPrivateKey'] = async (
    curve = defaultCurve
) => {
    const ecdh = await crypto.subtle.generateKey(
        curveToKeyParams(curve),
        true,
        ['deriveKey']
    );
    const key = await crypto.subtle.exportKey('jwk', ecdh.privateKey);
    return padBytes(
        decode({ text: key.d!, encoding: 'base64url' }),
        eccMeta(curve).bytes
    );
};

const getPublicKey = (privateKey: InputText, curve: Curve): Point => {

    const hex = encode(decode(privateKey), 'hex');

    return derivePublicKey(
        BigInt(`0x${hex}`),
        curves[curve]
    );
};
const bigIntToBase64Url = (x: bigint, bytes: number): string => encode(
    padBytes(
        decode({ text: x.toString(16), encoding: 'hex' }),
        bytes
    ),
    'base64url'
);
const derivePublicKeyBase64 = (
    privateKey: InputText,
    curve: Curve
): { x: string; y: string } => {
    const { x, y } = getPublicKey(privateKey, curve);
    const { bytes } = eccMeta(curve);
    return {
        x: bigIntToBase64Url(x, bytes),
        y: bigIntToBase64Url(y, bytes),
    };
};

export const generateEccPublicKey: typeof Ecc['generateEccPublicKey'] = (
    privateKey,
    curve = defaultCurve
) => {

    const { x, y } = getPublicKey(privateKey, curve);
    const { bytes } = eccMeta(curve);

    return new Uint8Array([
        // eslint-disable-next-line no-bitwise
        2 + Number(y & 1n),
        ...padBytes(decode({ text: x.toString(16), encoding: 'hex' }), bytes),
    ]);
};

const eccSecret = async ({ curve, privateKey, publicKey }: {
    curve: Curve;
    publicKey: InputText;
    privateKey: InputText;
}): Promise<{
    secret: Uint8Array;
    privateEc: CryptoKey;
}> => {

    const bufferPrivateKey = decode(privateKey);
    const curveParams = curveToKeyParams(curve);

    const [
        privateEc,
        publicEc,
    ] = await Promise.all([
        crypto.subtle.importKey(
            'jwk',
            {
                crv: curveParams.namedCurve,
                kty: 'EC',
                d: encode(bufferPrivateKey, 'base64url'),
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
            length: bytes * 8,
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

export const eccEncrypt: typeof Ecc['eccEncrypt'] = async ({
    data,
    publicKey,
    privateKey,
}, { curve = defaultCurve, encryption = defaultEncryption } = {}) => {

    const secretKey = await eccSecret({ curve, privateKey, publicKey });

    const [
        encrypted,
        jwk,
    ] = await Promise.all([
        encrypt({
            data,
            secret: secretKey.secret,
        }, { encryption, hash: 'raw' }),
        crypto.subtle.exportKey('jwk', secretKey.privateEc),
    ]);

    // eslint-disable-next-line no-bitwise
    const odd = decode({ text: jwk.y!, encoding: 'base64url' }).reverse()[0]! & 1;

    const publicX = decode({ text: jwk.x!, encoding: 'base64url' });
    const { bytes } = eccMeta(curve);

    return {
        ...encrypted,
        publicKey: new Uint8Array([
            2 + odd,
            ...padBytes(publicX, bytes),
        ]),
    };
};
export const eccDecrypt: typeof Ecc['eccDecrypt'] = async ({
    encrypted,
    iv,
    publicKey,
    privateKey,
}, { curve = defaultCurve, encryption = defaultEncryption } = {}) => {

    const { secret } = await eccSecret({ curve, privateKey, publicKey });

    return decrypt({
        encrypted,
        iv,
        secret,
    }, { encryption, hash: 'raw' });
};
