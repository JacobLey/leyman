import type { InputText, Uint8ArrayBuffer } from '../lib/types.js';
import { decode, encode } from '#encode';
import { padBytes } from '../lib/bytes-length.js';
import { curves, deriveYCoordinate } from '../lib/math.js';
import { eccMeta } from '../lib/size-meta.js';
import { defaultCurve } from '../lib/types.js';

const HEX_SIZE = 16;
const DECOMPRESSED_KEY_PREFIX = 4;
const EVEN_KEY_PREFIX = 2;
const ODD_KEY_PREFIX = 3;

/**
 * Compress an ECC Public Key.
 *
 * Idempotent, accepts an already compressed key and will return it unchanged.
 *
 * "Compressed" public keys are effectively ~50% the size of the original key.
 *
 * @param publicKey - public key to compress
 * @param [curve] - curve algorithm, defaults to p256
 * @returns compressed public key
 */
export const compressEccPublicKey = (
    publicKey: InputText,
    curve = defaultCurve
): Uint8ArrayBuffer => {
    const decoded = decode(publicKey);
    const { bytes } = eccMeta(curve);
    if (decoded.byteLength <= bytes + 1) {
        return decoded;
    }
    const x = decoded.slice(1, bytes + 1);
    const odd = decoded.slice(bytes + 1).toReversed()[0]! & 1;
    return new Uint8Array([EVEN_KEY_PREFIX + odd, ...x]);
};

/**
 * Decompress an ECC Public Key.
 *
 * Idempotent, accepts an already "uncompressed" key and will return it unchanged.
 *
 * @param publicKey - public key to decompress
 * @param [curve] - curve algorithm, defaults to p256
 * @returns uncompressed public key
 * @throws {Error} if the key isn't a point on the curve
 */
export const decompressEccPublicKey = (
    publicKey: InputText,
    curve = defaultCurve
): Uint8ArrayBuffer => {
    const decoded = decode(publicKey);
    const { bytes } = eccMeta(curve);
    if (decoded.byteLength > bytes + 1) {
        return decoded;
    }
    const [prefix] = decoded;
    if (
        decoded.byteLength !== bytes + 1 ||
        (prefix !== EVEN_KEY_PREFIX && prefix !== ODD_KEY_PREFIX)
    ) {
        throw new Error('Public key is not a compressed or uncompressed key for the curve');
    }
    const x = decoded.slice(1);
    const isOdd = prefix === ODD_KEY_PREFIX;
    const y = deriveYCoordinate(BigInt(`0x${encode(x, 'hex')}`), isOdd, curves[curve]);
    const decodedY = decode({ text: y.toString(HEX_SIZE), encoding: 'hex' });
    return new Uint8Array([DECOMPRESSED_KEY_PREFIX, ...x, ...padBytes(decodedY, bytes)]);
};
