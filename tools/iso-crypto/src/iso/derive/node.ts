import type { HashAlgorithm } from '../lib/types.js';
import type * as Derive from './types.js';
import { hkdf, pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';
import { decode } from '#encode';
import { defaultHash } from '../lib/types.js';
import { BITS_PER_BYTE, defaultIterations, defaultSize } from './defaults.js';

const hkdfAsync = promisify(hkdf);
const pbkdf2Async = promisify(pbkdf2);

const hashAlgorithm = ({ algorithm, size }: HashAlgorithm): string => {
    if (algorithm === 'SHA1') {
        return 'sha1';
    }
    return `sha${size}`;
};

export const deriveKey: (typeof Derive)['deriveKey'] = async ({ secret, salt }, options = {}) => {
    const digest = hashAlgorithm(options.hash ?? defaultHash);
    const bytes = (options.size ?? defaultSize) / BITS_PER_BYTE;

    if (options.algorithm === 'HKDF') {
        const key = await hkdfAsync(
            digest,
            decode(secret),
            decode(salt),
            decode(options.info ?? ''),
            bytes
        );
        return new Uint8Array(key);
    }

    const key = await pbkdf2Async(
        decode(secret),
        decode(salt),
        options.iterations ?? defaultIterations,
        bytes,
        digest
    );
    return new Uint8Array(key);
};
