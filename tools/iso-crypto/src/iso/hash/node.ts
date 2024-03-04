import { createHash } from 'node:crypto';
import { decode } from '#encode';
import { defaultHash, type HashAlgorithm } from '../lib/types.js';
import type * as HashMethods from './types.js';

const hashAlgorithm = ({ algorithm, size }: HashAlgorithm): string => {
    if (algorithm === 'SHA1') {
        return 'SHA1';
    }
    return `sha${size}`;
};

export const hash: (typeof HashMethods)['hash'] = async (
    input,
    algorithm = defaultHash
) => {
    const decoded = decode(input);

    if (algorithm === 'raw') {
        return decoded;
    }

    return createHash(hashAlgorithm(algorithm)).update(decoded).digest();
};
