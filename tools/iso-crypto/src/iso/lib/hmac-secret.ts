import type { InputText, Uint8ArrayBuffer } from './types.js';
import { decode } from '#encode';

/**
 * Decode the secret of an HMAC.
 *
 * WebCrypto refuses an empty HMAC key, where `node:crypto` accepts it, so both reject it for the same
 * result everywhere.
 *
 * @see {@link https://w3c.github.io/webcrypto/#hmac-operations-import-key}
 *
 * @param secret - key the caller passed to `hmac` or `verifyHmac`
 * @returns decoded secret
 * @throws {RangeError} when the secret is empty
 */
export const decodeHmacSecret = (secret: InputText): Uint8ArrayBuffer => {
    const decoded = decode(secret);
    if (decoded.byteLength === 0) {
        throw new RangeError('HMAC secret must not be empty');
    }
    return decoded;
};
