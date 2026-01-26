import type { Uint8ArrayBuffer } from './types.js';

/**
 * Extend an Uint8Array to be _at least_ `bytes` long.
 * Prepends 0 to beginning as necessary.
 *
 * @param arr - byte array
 * @param bytes - desired min length
 * @returns properly sized array.
 */
export const padBytes = (arr: Uint8ArrayBuffer, bytes: number): Uint8ArrayBuffer => {
    if (arr.byteLength >= bytes) {
        return arr;
    }

    const output = new Uint8Array(bytes);
    const offset = bytes - arr.length;

    for (let i = offset, j = 0; i < bytes; ++i, ++j) {
        output[i] = arr[j]!;
    }
    return output;
};

/**
 * Restrict an Uint8Array to be _at most_ `bytes` long.
 * Strips bytes from beginning as necessary.
 *
 * @param arr - byte array
 * @param bytes - desired max length
 * @returns properly sized array.
 */
export const trimBytes = (arr: Uint8ArrayBuffer, bytes: number): Uint8ArrayBuffer => {
    if (arr.byteLength <= bytes) {
        return arr;
    }

    return arr.slice(arr.length - bytes);
};

/**
 * Restrict an Uint8Array to be _exactly_ `bytes` long.
 * Prepends and strips bytes from beginning as necessary.
 *
 * @param arr - byte array
 * @param bytes - desired length
 * @returns properly sized array.
 */
export const fixBytes = (arr: Uint8ArrayBuffer, bytes: number): Uint8ArrayBuffer =>
    padBytes(trimBytes(arr, bytes), bytes);
