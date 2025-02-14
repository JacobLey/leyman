import { decode } from '#encode';
import { Algorithms, defaultHash, type HashAlgorithm } from '../lib/types.js';
import type * as HashMethods from './types.js';

const { crypto } = globalThis;

const hashAlgorithm = ({ algorithm, size }: HashAlgorithm): string => {
    if (algorithm === Algorithms.SHA1) {
        return 'SHA-1';
    }
    return `SHA-${size}`;
};

export const hash: (typeof HashMethods)['hash'] = async (input, algorithm = defaultHash) => {
    const decoded = decode(input);

    if (algorithm === Algorithms.RAW) {
        return decoded;
    }

    const buffer = await crypto.subtle.digest(hashAlgorithm(algorithm), decoded);
    return new Uint8Array(buffer);
};
