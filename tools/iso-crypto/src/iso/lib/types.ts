export type Encryption =
    | {
          cipher: 'AES';
          size: 128 | 192 | 256;
          mode: 'CBC';
      }
    | {
          cipher: 'AES';
          size: 128 | 192 | 256;
          mode: 'CTR';
      };
export const defaultEncryption: Encryption = {
    cipher: 'AES',
    size: 256,
    mode: 'CTR',
};

export type HashAlgorithm =
    | {
          algorithm: 'SHA1';
          size?: 160;
      }
    | {
          algorithm: 'SHA2';
          size: 256 | 384 | 512;
      };

export type Hash = 'raw' | HashAlgorithm;
export const defaultHash: HashAlgorithm = {
    algorithm: 'SHA2',
    size: 256,
};

export type Encoding = 'base64' | 'base64url' | 'hex' | 'utf8';
export const defaultEncoding: Encoding = 'utf8';

export type Curve = 'p256' | 'p384' | 'p521';
export const defaultCurve: Curve = 'p256';

export type InputText =
    | string
    | Uint8Array
    | {
          text: string;
          encoding: Encoding;
      }
    | {
          text: Uint8Array;
          encoding: 'raw';
      };
