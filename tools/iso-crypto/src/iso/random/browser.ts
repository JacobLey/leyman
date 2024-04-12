import type * as Random from './types.js';

const { crypto } = globalThis;

export const randomBytes: (typeof Random)['randomBytes'] = async size =>
    crypto.getRandomValues(new Uint8Array(size));
