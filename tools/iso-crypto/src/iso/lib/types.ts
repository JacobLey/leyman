export type Encryption = {
    cipher: 'AES';
    size: 128 | 192 | 256;
    mode: 'CBC';
} | {
    cipher: 'AES';
    size: 128 | 192 | 256;
    mode: 'CTR';
};
export const defaultEncryption: Encryption = {
    cipher: 'AES',
    size: 256,
    mode: 'CTR',
};

export type HashAlgorithm = {
    algorithm: 'SHA1';
    size?: 160;
} | {
    algorithm: 'SHA2';
    size: 256 | 384 | 512;
};

export type Hash = 'raw' | HashAlgorithm;
export const defaultHash: HashAlgorithm = {
    algorithm: 'SHA2',
    size: 256,
};

export type Encoding = 'base64' | 'base64url' | 'hex' | 'utf8';
export const defaultEncoding = 'utf8';

export type InputText = string | Uint8Array | {
    text: string;
    encoding: Encoding;
} | {
    text: Uint8Array;
    encoding: 'raw';
};

export interface Methods {
    encode: (input: InputText) => Uint8Array;
    decode: (
        input: InputText,
        encoding?: Encoding | undefined
    ) => string;
    randomBytes: (size: number) => Promise<Uint8Array>;
    hash: (
        secret: InputText,
        algorithm?: Hash | undefined
    ) => Promise<Uint8Array>;
    hashedEncrypt: (
        data: Uint8Array,
        secret: Promise<Uint8Array> | Uint8Array,
        encryption: Encryption
    ) => Promise<{
        encrypted: Uint8Array;
        iv: Uint8Array;
    }>;
    hashedDecrypt: (
        encrypted: Uint8Array,
        iv: Uint8Array,
        secret: Uint8Array,
        encryption: Encryption
    ) => Promise<Uint8Array>;
    generateEccPrivateKey: () => Promise<Uint8Array>;
    generateEccPublicKey: (privateKey: InputText) => Uint8Array;
    eccEncrypt: (
        params: {
            data: InputText;
            publicKey: InputText;
            privateKey: InputText;
        },
        options?: {
            encryption?: Encryption | undefined;
        }
    ) => Promise<{
        encrypted: Uint8Array;
        iv: Uint8Array;
        publicKey: Uint8Array;
    }>;
    eccDecrypt: (
        params: {
            encrypted: InputText;
            iv: InputText;
            publicKey: InputText;
            privateKey: InputText;
        },
        options?: {
            encryption?: Encryption | undefined;
        }
    ) => Promise<Uint8Array>;
}