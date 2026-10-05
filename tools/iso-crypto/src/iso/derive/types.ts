import type { HashAlgorithm, InputText, Uint8ArrayBuffer } from '../lib/types.js';

/**
 * Options shared by every key derivation algorithm.
 */
interface BaseDeriveOptions {
    /**
     * Hash algorithm the derivation is built on, defaults to SHA256.
     */
    hash?: HashAlgorithm | undefined;
    /**
     * Size of the derived key in bits, defaults to 256. Must be a multiple of 8.
     */
    size?: number | undefined;
}

/**
 * PBKDF2, for low-entropy secrets such as passwords.
 * Deliberately slow, which makes guessing the secret expensive.
 */
export interface Pbkdf2Options extends BaseDeriveOptions {
    algorithm?: 'PBKDF2' | undefined;
    /**
     * Number of iterations, defaults to 600,000 (OWASP's recommendation for PBKDF2 with SHA256).
     * Higher is slower, for both you and an attacker.
     */
    iterations?: number | undefined;
}

/**
 * HKDF, for secrets that are already high-entropy, such as an ECDH shared secret or a random key.
 * Fast, so not suitable for passwords.
 */
export interface HkdfOptions extends BaseDeriveOptions {
    algorithm: 'HKDF';
    /**
     * Context for the key, such as its purpose, so one secret can derive several unrelated keys.
     */
    info?: InputText | undefined;
}

/**
 * Derive a key of a fixed size from a secret.
 *
 * The result can be used as the `secret` of `encrypt`/`decrypt` with `{ hash: 'raw' }`.
 *
 * @param params - required parameters
 * @param params.secret - secret to derive the key from, such as a password
 * @param params.salt - random value stored alongside the result, so equal secrets derive different keys.
 * Use a new one (e.g. `randomBytes(16)`) per secret.
 * @param [options] - optional
 * @param [options.algorithm] - `PBKDF2` (default) for passwords, `HKDF` for high-entropy secrets
 * @param [options.hash] - hash algorithm, defaults to SHA256
 * @param [options.size] - size of the key in bits, defaults to 256
 * @param [options.iterations] - PBKDF2 only, defaults to 600,000
 * @param [options.info] - HKDF only, context for the key
 * @returns derived key
 */
export declare const deriveKey: (
    params: {
        /**
         * Secret to derive the key from, such as a password.
         */
        secret: InputText;
        /**
         * Random value stored alongside the result, so equal secrets derive different keys.
         */
        salt: InputText;
    },
    options?: HkdfOptions | Pbkdf2Options
) => Promise<Uint8ArrayBuffer>;
