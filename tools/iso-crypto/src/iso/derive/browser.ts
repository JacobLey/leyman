import type { HashAlgorithm } from '../lib/types.js';
import type * as Derive from './types.js';
import { decode } from '#encode';
import { defaultHash } from '../lib/types.js';
import { defaultIterations, defaultSize } from './defaults.js';

const { crypto } = globalThis;

const hashAlgorithm = ({ algorithm, size }: HashAlgorithm): string => {
    if (algorithm === 'SHA1') {
        return 'SHA-1';
    }
    return `SHA-${size}`;
};

export const deriveKey: (typeof Derive)['deriveKey'] = async ({ secret, salt }, options = {}) => {
    const hash = hashAlgorithm(options.hash ?? defaultHash);
    const name = options.algorithm ?? 'PBKDF2';

    const key = await crypto.subtle.importKey('raw', decode(secret), name, false, ['deriveBits']);

    const algorithm: HkdfParams | Pbkdf2Params =
        options.algorithm === 'HKDF'
            ? { name, hash, salt: decode(salt), info: decode(options.info ?? '') }
            : {
                  name,
                  hash,
                  salt: decode(salt),
                  iterations: options.iterations ?? defaultIterations,
              };

    const bits = await crypto.subtle.deriveBits(algorithm, key, options.size ?? defaultSize);
    return new Uint8Array(bits);
};
