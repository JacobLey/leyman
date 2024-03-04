import type { Curve, Encryption, InputText } from '../lib/types.js';

/**
 * Generate a prime256v1 ECC private key.
 *
 * @param {string} [curve] - curve algorithm, defaults to p256
 * @returns {Promise<Uint8Array>} private key
 */
export declare const generateEccPrivateKey: (
    curve?: Curve | undefined
) => Promise<Uint8Array>;

/**
 * Generate a public key from the incoming private key.
 *
 * Returns key in "compressed" format.
 *
 * @param {InputText} privateKey - private key
 * @param {string} [curve] - curve algorithm, defaults to p256
 * @returns {Uint8Array} public key
 */
export declare const generateEccPublicKey: (
    privateKey: InputText,
    curve?: Curve | undefined
) => Uint8Array;

/**
 * Encrypt data using a "sender's" ECC private key, and a
 * "receiver's" public key.
 *
 * Performs symmetric encryption under the hood using specified algorithm.
 *
 * @param {object} params - params
 * @param {InputInput} params.data - data to encrypt
 * @param {InputText} params.privateKey - "sender's" private key
 * @param {InputText} params.publicKey - "receiver's" public key
 * @param {object} [options] - options
 * @param {string} [options.curve] - curve algorithm, defaults to p256
 * @param {object} [options.encryption] - symmetric encryption algorithm to use, defaults to `aes-256-ctr`
 * @returns {Promise<object>} encrypted data and initialization vector.
 *                            Also the "sender's" public key for convenience.
 */
export declare const eccEncrypt: (
    params: {
        data: InputText;
        privateKey: InputText;
        publicKey: InputText;
    },
    options?: {
        curve?: Curve | undefined;
        encryption?: Encryption | undefined;
    }
) => Promise<{
    encrypted: Uint8Array;
    iv: Uint8Array;
    publicKey: Uint8Array;
}>;

/**
 * Decrypt data using a "sender's" ECC public key, and a
 * "receiver's" private key.
 *
 * Performs symmetric encryption under the hood using specified algorithm.
 *
 * Ensure that the same encryption algorithm is specified as when originally encrypting the data.
 *
 * @param {object} params - params
 * @param {InputInput} params.encrypted - encrypted data. See output of `eccEncrypt`
 * @param {InputText} params.iv - initialization vector. See output of `eccEncrypt`.
 * @param {InputText} params.privateKey - "receiver's" private key
 * @param {InputText} params.publicKey - "sender's" public key. See output of `eccEncrypt`.
 * @param {object} [options] - options
 * @param {string} [options.curve] - curve algorithm, defaults to p256
 * @param {object} [options.encryption] - symmetric encryption algorithm to use, defaults to `aes-256-ctr`
 * @returns {Promise<Uint8Array>} decrypted data
 */
export declare const eccDecrypt: (
    params: {
        encrypted: InputText;
        iv: InputText;
        publicKey: InputText;
        privateKey: InputText;
    },
    options?: {
        curve?: Curve | undefined;
        encryption?: Encryption | undefined;
    }
) => Promise<Uint8Array>;
