import type { Encryption, InputText, Uint8ArrayBuffer } from './types.js';
import { decode } from '#encode';

/**
 * Decode the additional authenticated data for an encryption algorithm.
 *
 * Only GCM authenticates additional data. Other modes throw rather than ignore it, which would leave
 * the caller believing it is protected.
 *
 * @param encryption - encryption algorithm
 * @param additionalData - additional authenticated data, if any
 * @returns decoded additional data, or `undefined` when there is none
 * @throws {TypeError} when additional data is given for a mode other than GCM
 */
export const decodeAdditionalData = (
    encryption: Encryption,
    additionalData: InputText | undefined
): Uint8ArrayBuffer | undefined => {
    if (additionalData === undefined) {
        return undefined;
    }
    if (encryption.mode !== 'GCM') {
        throw new TypeError(
            `AES-${encryption.mode} does not authenticate additional data, only GCM does`
        );
    }
    return decode(additionalData);
};
