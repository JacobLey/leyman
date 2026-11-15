import type { HashAlgorithm } from '#internal/iso/lib/types.js';
import type * as Hmac from './types.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { decode } from '#encode';
import { decodeHmacSecret } from '#internal/iso/lib/hmac-secret.js';
import { defaultHash } from '#internal/iso/lib/types.js';

const hashAlgorithm = ({ algorithm, size }: HashAlgorithm): string =>
    algorithm === 'SHA1' ? 'sha1' : `sha${size}`;

export const hmac: (typeof Hmac)['hmac'] = async ({ data, secret }, { hash = defaultHash } = {}) =>
    createHmac(hashAlgorithm(hash), decodeHmacSecret(secret)).update(decode(data)).digest();

export const verifyHmac: (typeof Hmac)['verifyHmac'] = async (
    { data, secret, signature },
    options
) => {
    const expected = await hmac({ data, secret }, options);
    const actual = decode(signature);
    // `timingSafeEqual` throws for unequal lengths. The expected length is the hash's output size, so
    // checking it first reveals nothing.
    return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
};
