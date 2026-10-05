import type * as Random from './types.js';

const { crypto } = globalThis;

/**
 * Most bytes `getRandomValues` fills in a single call.
 */
const MAX_RANDOM_BYTES = 0x10000;

export const randomBytes: (typeof Random)['randomBytes'] = async size => {
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i += MAX_RANDOM_BYTES) {
        crypto.getRandomValues(bytes.subarray(i, i + MAX_RANDOM_BYTES));
    }
    return bytes;
};
