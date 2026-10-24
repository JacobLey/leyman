/**
 * Allows string literals in place of enum.
 *
 * @template E - either entire enum or single value
 */
type EnumToString<E extends string> = `${E}`;
/**
 * Allows number literals in place of enum.
 *
 * @template E - either entire enum or single value
 */
type EnumToNumber<E extends number> = `${E}` extends `${infer N extends number}` ? N : never;

export enum Ciphers {
    AES = 'AES',
}
export enum Modes {
    CBC = 'CBC',
    CTR = 'CTR',
    GCM = 'GCM',
}
export enum Sizes {
    KEY_128 = 128,
    KEY_160 = 160,
    /**
     * @deprecated as an AES key size. Chromium-based browsers do not support 192-bit AES keys,
     * so it only works on Node.js, Firefox and Safari. Use 128 or 256 bits.
     */
    KEY_192 = 192,
    KEY_256 = 256,
    KEY_384 = 384,
    KEY_512 = 512,
}

/**
 * AES key sizes. 192 bits is deprecated, as Chromium-based browsers do not support it.
 */
type AesSize = EnumToNumber<
    | Sizes.KEY_128
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- still accepted, so existing data stays readable
    | Sizes.KEY_192
    | Sizes.KEY_256
>;

export type Encryption =
    | {
          cipher: EnumToString<Ciphers.AES>;
          // Only key sizes every browser supports
          size: EnumToNumber<Sizes.KEY_128 | Sizes.KEY_256>;
          mode: EnumToString<Modes.GCM>;
      }
    | {
          cipher: EnumToString<Ciphers.AES>;
          size: AesSize;
          mode: EnumToString<Modes.CBC>;
      }
    | {
          cipher: EnumToString<Ciphers.AES>;
          size: AesSize;
          mode: EnumToString<Modes.CTR>;
      };
/**
 * AES-256-GCM, which detects tampering.
 */
export const defaultEncryption: Encryption = {
    cipher: Ciphers.AES,
    size: Sizes.KEY_256,
    mode: Modes.GCM,
};
/**
 * AES-256-CTR, the default encryption before iso-crypto 3. It does not detect tampering: altered data
 * decrypts to garbage instead of throwing.
 *
 * Pass as the `encryption` option to decrypt data that was encrypted with the old default.
 *
 * @example
 * await decrypt({ encrypted, iv, secret }, { encryption: unsafeLegacyEncryption });
 */
export const unsafeLegacyEncryption: Encryption = Object.freeze({
    cipher: Ciphers.AES,
    size: Sizes.KEY_256,
    mode: Modes.CTR,
});

export enum Algorithms {
    SHA1 = 'SHA1',
    SHA2 = 'SHA2',
    RAW = 'raw',
}
export type HashAlgorithm =
    | {
          algorithm: EnumToString<Algorithms.SHA1>;
          size?: EnumToNumber<Sizes.KEY_160>;
      }
    | {
          algorithm: EnumToString<Algorithms.SHA2>;
          size: EnumToNumber<Sizes.KEY_256 | Sizes.KEY_384 | Sizes.KEY_512>;
      };

export type Hash = EnumToString<Algorithms.RAW> | HashAlgorithm;
export const defaultHash: HashAlgorithm = {
    algorithm: Algorithms.SHA2,
    size: Sizes.KEY_256,
};

export type Encoding = 'base64' | 'base64url' | 'hex' | 'utf8';
export type Encodings = 'raw' | Encoding;

export const defaultEncoding: Encoding = 'utf8';

export type Curve = 'p256' | 'p384' | 'p521';
export const defaultCurve: Curve = 'p256';

export type Uint8ArrayBuffer = ArrayBufferView<ArrayBuffer> & Uint8Array;

export type InputText =
    | string
    | Uint8ArrayBuffer
    | {
          text: string;
          encoding: Encoding;
      }
    | {
          text: Uint8ArrayBuffer;
          encoding: 'raw';
      };
