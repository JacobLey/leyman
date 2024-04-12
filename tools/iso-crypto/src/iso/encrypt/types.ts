import type { Encryption, Hash, InputText } from '../lib/types.js';

/**
 * Encrypt the incoming content using the specified encryption and hashing algorithms.
 *
 * @param params - required parameters
 * @param params.data - content to encrypt
 * @param params.secret - secret key for encryption
 * @param [options] - optional
 * @param [options.encryption] - encryption algorithm to use, defaults to `aes-256-ctr`
 * @param [options.hash] - Hash algorithm to use to fit secret to the required key size.
 * Defaults to SHA256. Set to `'raw'` to avoid hashing.
 * @returns encrypted text and accompanying initialization vector
 */
export declare const encrypt: (
    params: {
        /**
         * Content to encrypt.
         */
        data: InputText;
        /**
         * Secret key for encryption.
         */
        secret: InputText;
    },
    options?: {
        /**
         * Encryption algorithm to use, defaults to `aes-256-ctr`.
         */
        encryption?: Encryption | undefined;
        /**
         * Hash algorithm to use to fit secret to the required key size.
         * Defaults to SHA256. Set to `'raw'` to avoid hashing.
         */
        hash?: Hash | undefined;
    }
) => Promise<{
    encrypted: Uint8Array;
    iv: Uint8Array;
}>;

/**
 * Decrypt the content using the specified encryption and hashing algorithms.
 *
 * Ensure that encryption + hashing algorithms used match those used when initially encrypting the data.
 *
 * @param params - required parameters
 * @param params.encrypted - encrypted content, see output of `encrypt`
 * @param params.iv - initialization vector used during encryption, see output of `encrypt`
 * @param params.secret - secret key for encryption
 * @param [options] - optional
 * @param [options.encryption] - encryption algorithm to use, defaults to `aes-256-ctr`
 * @param [options.hash] - hash algorithm to use to fit secret to the required key size.
 * Defaults to SHA256. Set to `'raw'` to avoid hashing.
 * @returns encrypted text and accompanying initialization vector
 */
export declare const decrypt: (
    params: {
        /**
         * Encrypted data.
         */
        encrypted: InputText;
        /**
         * Random initialization vector created with original encryption.
         */
        iv: InputText;
        /**
         * Secret key for encryption.
         */
        secret: InputText;
    },
    options?: {
        /**
         * Encryption algorithm to use, defaults to `aes-256-ctr`.
         */
        encryption?: Encryption | undefined;
        /**
         * Hash algorithm to use to fit secret to the required key size.
         * Defaults to SHA256. Set to `'raw'` to avoid hashing.
         */
        hash?: Hash | undefined;
    }
) => Promise<Uint8Array>;
