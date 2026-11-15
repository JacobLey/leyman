import type { HashAlgorithm, InputText } from '#internal/iso/lib/types.js';
import type * as Hmac from './types.js';
import { decode } from '#encode';
import { decodeHmacSecret } from '#internal/iso/lib/hmac-secret.js';
import { defaultHash } from '#internal/iso/lib/types.js';

const { crypto } = globalThis;

const hashAlgorithm = ({ algorithm, size }: HashAlgorithm): string =>
    algorithm === 'SHA1' ? 'SHA-1' : `SHA-${size}`;

const importKey = async (
    secret: InputText,
    hash: HashAlgorithm,
    usage: KeyUsage
): Promise<CryptoKey> =>
    crypto.subtle.importKey(
        'raw',
        decodeHmacSecret(secret),
        { name: 'HMAC', hash: hashAlgorithm(hash) },
        false,
        [usage]
    );

export const hmac: (typeof Hmac)['hmac'] = async (
    { data, secret },
    { hash = defaultHash } = {}
) => {
    const key = await importKey(secret, hash, 'sign');
    const signature = await crypto.subtle.sign('HMAC', key, decode(data));
    return new Uint8Array(signature);
};

// `verify` compares in constant time, and resolves `false` for a signature of the wrong length.
// https://w3c.github.io/webcrypto/#hmac-operations-verify
export const verifyHmac: (typeof Hmac)['verifyHmac'] = async (
    { data, secret, signature },
    { hash = defaultHash } = {}
) => {
    const key = await importKey(secret, hash, 'verify');
    return crypto.subtle.verify('HMAC', key, decode(signature), decode(data));
};
