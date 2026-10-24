import type { Curve, Encryption, InputText, Uint8ArrayBuffer } from '../lib/types.js';

/**
 * Generate a random ECC private key on the given curve.
 *
 * @param [curve] - curve algorithm, defaults to p256
 * @returns random private key
 */
export declare const generateEccPrivateKey: (curve?: Curve) => Promise<Uint8ArrayBuffer>;

/**
 * Generate a public key from the incoming private key.
 *
 * Returns key in "compressed" format.
 *
 * @param privateKey - private key to compress
 * @param [curve] - curve algorithm, defaults to p256
 * @returns public key from private key
 */
export declare const generateEccPublicKey: (
    privateKey: InputText,
    curve?: Curve
) => Uint8ArrayBuffer;

/**
 * Encrypt data using a "sender's" ECC private key, and a
 * "receiver's" public key.
 *
 * Performs symmetric encryption under the hood using specified algorithm.
 *
 * @param params - required parameters
 * @param params.data - data to encrypt
 * @param params.privateKey - "sender's" private key
 * @param params.publicKey - "receiver's" public key
 * @param [options] - optional
 * @param [options.curve] - curve algorithm, defaults to p256
 * @param [options.encryption] - symmetric encryption algorithm to use, defaults to `aes-256-gcm`
 * @param [options.additionalData] - GCM only, data to authenticate but not encrypt
 * @returns encrypted data and initialization vector.
 * Also the "sender's" public key for convenience.
 */
export declare const eccEncrypt: (
    params: {
        /**
         * Data to encrypt.
         */
        data: InputText;
        /**
         * "sender's" private key.
         */
        privateKey: InputText;
        /**
         * "receiver's" public key.
         */
        publicKey: InputText;
    },
    options?: {
        /**
         * Curve algorithm, defaults to p256.
         */
        curve?: Curve | undefined;
        /**
         * Symmetric encryption algorithm to use, defaults to `aes-256-gcm`.
         */
        encryption?: Encryption | undefined;
        /**
         * Additional authenticated data, GCM only (throws for other modes). It is not encrypted or part of the
         * output, but decryption rejects unless given the same value, e.g. to bind a ciphertext to a record ID.
         */
        additionalData?: InputText | undefined;
    }
) => Promise<{
    encrypted: Uint8ArrayBuffer;
    iv: Uint8ArrayBuffer;
    publicKey: Uint8ArrayBuffer;
}>;

/**
 * Decrypt data using a "sender's" ECC public key, and a
 * "receiver's" private key.
 *
 * Performs symmetric encryption under the hood using specified algorithm.
 *
 * Ensure that the same encryption algorithm is specified as when originally encrypting the data.
 *
 * @param params - required parameters
 * @param params.encrypted - encrypted data. See output of `eccEncrypt`
 * @param params.iv - initialization vector. See output of `eccEncrypt`.
 * @param params.privateKey - "receiver's" private key
 * @param params.publicKey - "sender's" public key. See output of `eccEncrypt`.
 * @param [options] - optional
 * @param [options.curve] - curve algorithm, defaults to p256
 * @param [options.encryption] - symmetric encryption algorithm to use, defaults to `aes-256-gcm`
 * Pass `unsafeLegacyEncryption` for data encrypted with the default before iso-crypto 3 (`aes-256-ctr`).
 * @param [options.additionalData] - GCM only, data to authenticate but not encrypt
 * @returns decrypted data
 */
export declare const eccDecrypt: (
    params: {
        /**
         * Encrypted data. See output of `eccEncrypt`.
         */
        encrypted: InputText;
        /**
         * Initialization vector. See output of `eccEncrypt`.
         */
        iv: InputText;
        /**
         * "receiver's" private key.
         */
        privateKey: InputText;
        /**
         * "sender's" public key. See output of `eccEncrypt`.
         */
        publicKey: InputText;
    },
    options?: {
        /**
         * Curve algorithm, defaults to p256.
         */
        curve?: Curve | undefined;
        /**
         * Symmetric encryption algorithm to use, defaults to `aes-256-gcm`.
         * Pass `unsafeLegacyEncryption` for data encrypted with the default before iso-crypto 3 (`aes-256-ctr`).
         */
        encryption?: Encryption | undefined;
        /**
         * Additional authenticated data, GCM only (throws for other modes). It is not encrypted or part of the
         * output, but decryption rejects unless given the same value, e.g. to bind a ciphertext to a record ID.
         */
        additionalData?: InputText | undefined;
    }
) => Promise<Uint8ArrayBuffer>;
