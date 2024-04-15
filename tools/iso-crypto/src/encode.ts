import { decode, encode } from '#encode';
import { defaultEncoding, type Encoding } from './iso/lib/types.js';

export { decode, encode, type Encoding };

type Replace<From, To, T extends Record<string, From>> = {
    [k in keyof T]: To;
};
type Encoded<T extends Record<string, string>> = Replace<string, Uint8Array, T>;
type Decoded<T extends Record<string, Uint8Array>> = Replace<Uint8Array, string, T>;

/**
 * Decode every attribute in an object.
 *
 * Convenience method when de-serializing encoded input (e.g. hex encoded text from JSON).
 *
 * @param obj - map of key to string
 * @param [encoding='utf8'] - encoding of strings, defaults to UTF8
 * @returns same interface as input, with Uint8Array
 */
export const decodeObject = <T extends Record<string, string>>(
    obj: T,
    encoding: Encoding = defaultEncoding
): Encoded<T> => {
    const result: Partial<Encoded<T>> = {};
    for (const [key, text] of Object.entries(obj)) {
        result[key as keyof T] = decode({ text, encoding });
    }
    return result as Encoded<T>;
};

/**
 * Encode every attribute in an object.
 *
 * Convenience method when serializing decoded content (e.g. hex encoding prior to `JSON.stringify`).
 *
 * @param obj - map of key to Uint8Array
 * @param [encoding='utf8'] - encoding to use, defaults to UTF8
 * @returns same interface as input, with strings
 */
export const encodeObject = <T extends Record<string, Uint8Array>>(
    obj: T,
    encoding?: Encoding
): Decoded<T> => {
    const result: Partial<Decoded<T>> = {};
    for (const [key, arr] of Object.entries(obj)) {
        result[key as keyof T] = encode(arr, encoding);
    }
    return result as Decoded<T>;
};
