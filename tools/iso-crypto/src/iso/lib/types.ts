/**
 * Allows string literals in place of enum.
 *
 * @template E - either entire enum or single value
 */
type EnumToString<E extends string> = `${E}`;

export const enum Ciphers {
    AES = 'AES',
}
export const enum Modes {
    CBC = 'CBC',
    CTR = 'CTR',
}
export const enum Sizes {
    KEY_128 = 128,
    KEY_160 = 160,
    KEY_192 = 192,
    KEY_256 = 256,
    KEY_384 = 384,
    KEY_512 = 512,
}

export type Encryption =
    | {
          cipher: EnumToString<Ciphers.AES>;
          size: Sizes.KEY_128 | Sizes.KEY_192 | Sizes.KEY_256;
          mode: EnumToString<Modes.CBC>;
      }
    | {
          cipher: EnumToString<Ciphers.AES>;
          size: Sizes.KEY_128 | Sizes.KEY_192 | Sizes.KEY_256;
          mode: EnumToString<Modes.CTR>;
      };
export const defaultEncryption: Encryption = {
    cipher: Ciphers.AES,
    size: Sizes.KEY_256,
    mode: Modes.CTR,
};

export const enum Algorithms {
    SHA1 = 'SHA1',
    SHA2 = 'SHA2',
    RAW = 'raw',
}
export type HashAlgorithm =
    | {
          algorithm: EnumToString<Algorithms.SHA1>;
          size?: Sizes.KEY_160;
      }
    | {
          algorithm: EnumToString<Algorithms.SHA2>;
          size: Sizes.KEY_256 | Sizes.KEY_384 | Sizes.KEY_512;
      };

export type Hash = EnumToString<Algorithms.RAW> | HashAlgorithm;
export const defaultHash: HashAlgorithm = {
    algorithm: Algorithms.SHA2,
    size: Sizes.KEY_256,
};

export const enum Encodings {
    BASE64 = 'base64',
    BASE64URL = 'base64url',
    HEX = 'hex',
    RAW = 'raw',
    UTF8 = 'utf8',
}
export type Encoding = EnumToString<
    Encodings.BASE64 | Encodings.BASE64URL | Encodings.HEX | Encodings.UTF8
>;

export const defaultEncoding: Encoding = Encodings.UTF8;

export const enum Curves {
    P256 = 'p256',
    P384 = 'p384',
    P521 = 'p521',
}
export type Curve = EnumToString<Curves>;
export const defaultCurve: Curve = Curves.P256;

export type InputText =
    | string
    | Uint8Array
    | {
          text: string;
          encoding: Encoding;
      }
    | {
          text: Uint8Array;
          encoding: EnumToString<Encodings.RAW>;
      };
