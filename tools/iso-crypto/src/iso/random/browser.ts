import crypto from '#crypto';
import type * as Random from './types.js';

export const randomBytes: (typeof Random)['randomBytes'] = async size =>
    crypto.getRandomValues(new Uint8Array(size));
