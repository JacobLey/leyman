/**
 * Append a key to a JSON Pointer, escaping it.
 *
 * @param pointer - JSON Pointer, as a URI fragment (e.g. `#/properties`)
 * @param key - key to append
 * @returns JSON Pointer to the key
 */
export const childPointer = (pointer: string, key: number | string): string =>
    `${pointer}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;
