import type { InputText } from '../lib/types.js';
import { decode, encode } from '#encode';
import { padBytes } from '../lib/bytes-length.js';
import { curves, deriveYCoordinate } from '../lib/math.js';
import { eccMeta } from '../lib/size-meta.js';
import { defaultCurve, Encodings } from '../lib/types.js';

const HEX_SIZE = 16;
const DECOMPRESSED_KEY_PREFIX = 4;

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
export const compressEccPublicKey = (publicKey: InputText, curve = defaultCurve): Uint8Array => {
    const decoded = decode(publicKey);
    const { bytes } = eccMeta(curve);
    if (decoded.length <= bytes + 1) {
        return decoded;
    }
    const x = decoded.slice(1, bytes + 1);
    // eslint-disable-next-line no-bitwise
    const odd = decoded.slice(bytes + 1).reverse()[0]! & 1;
    return new Uint8Array([2 + odd, ...x]);
};

/**
 * Decompress an ECC Public Key.
 *
 * Idempotent, accepts an already "uncompressed" key and will return it unchanged.
 *
 * @param publicKey - public key to decompress
 * @param [curve] - curve algorithm, defaults to p256
 * @returns uncompressed public key
 */
export const decompressEccPublicKey = (publicKey: InputText, curve = defaultCurve): Uint8Array => {
    const decoded = decode(publicKey);
    const { bytes } = eccMeta(curve);
    if (decoded.length > bytes + 1) {
        return decoded;
    }
    const x = decoded.slice(1);
    // eslint-disable-next-line no-bitwise
    const odd = !!(decoded[0]! & 1);
    const y = deriveYCoordinate(BigInt(`0x${encode(x, Encodings.HEX)}`), odd, curves[curve]);
    return new Uint8Array([
        DECOMPRESSED_KEY_PREFIX,
        ...x,
        ...padBytes(decode({ text: y.toString(HEX_SIZE), encoding: Encodings.HEX }), bytes),
    ]);
};
