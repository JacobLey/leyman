import type { HashAlgorithm } from '../lib/types.js';
import type * as HashMethods from './types.js';
import { createHash } from 'node:crypto';
import { decode } from '#encode';
import { Algorithms, defaultHash } from '../lib/types.js';

const hashAlgorithm = ({ algorithm, size }: HashAlgorithm): string =>
    algorithm === 'SHA1' ? 'SHA1' : `sha${size}`;

export const hash: (typeof HashMethods)['hash'] = async (input, algorithm = defaultHash) => {
    const decoded = decode(input);

    return algorithm === Algorithms.RAW
        ? decoded
        : createHash(hashAlgorithm(algorithm)).update(decoded).digest();
};
