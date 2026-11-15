import type { HashAlgorithm, InputText, Uint8ArrayBuffer } from '#internal/iso/lib/types.js';

/**
 * Sign data with an HMAC, a keyed hash that only holders of the secret can produce or check.
 *
 * @param params - required parameters
 * @param params.data - content to sign
 * @param params.secret - secret key, must not be empty
 * @param [options] - optional
 * @param [options.hash] - hash algorithm the HMAC is built on, defaults to SHA256
 * @returns signature, as long as the hash's output
 * @throws {RangeError} when the secret is empty
 */
export declare const hmac: (
    params: {
        /**
         * Content to sign.
         */
        data: InputText;
        /**
         * Secret key, must not be empty.
         */
        secret: InputText;
    },
    options?: {
        /**
         * Hash algorithm the HMAC is built on, defaults to SHA256.
         */
        hash?: HashAlgorithm | undefined;
    }
) => Promise<Uint8ArrayBuffer>;

/**
 * Check an HMAC signature of data, in constant time.
 *
 * A signature of the wrong length resolves `false`. Only the length can show in the timing, and the
 * expected length is public anyway, being the hash's output size.
 *
 * @param params - required parameters
 * @param params.data - signed content
 * @param params.secret - secret key, must not be empty
 * @param params.signature - signature to check
 * @param [options] - optional
 * @param [options.hash] - hash algorithm the HMAC is built on, defaults to SHA256
 * @returns whether the signature matches
 * @throws {RangeError} when the secret is empty
 */
// eslint-disable-next-line unicorn/consistent-boolean-name -- Resolves a boolean, but named for the action, like WebCrypto's `verify`
export declare const verifyHmac: (
    params: {
        /**
         * Signed content.
         */
        data: InputText;
        /**
         * Secret key, must not be empty.
         */
        secret: InputText;
        /**
         * Signature to check.
         */
        signature: InputText;
    },
    options?: {
        /**
         * Hash algorithm the HMAC is built on, defaults to SHA256.
         */
        hash?: HashAlgorithm | undefined;
    }
) => Promise<boolean>;
