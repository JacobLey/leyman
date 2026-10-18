import { DecantInvalidSchemaError, DecantUnsupportedError } from './errors.js';

/**
 * Append a key to a JSON Pointer, escaping it.
 *
 * @param pointer - JSON Pointer, as a URI fragment (e.g. `#/properties`)
 * @param key - key to append
 * @returns JSON Pointer to the key
 */
export const childPointer = (pointer: string, key: number | string): string =>
    `${pointer}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;

/**
 * Resolve a `$ref` against the document it is in.
 *
 * Only references within the same document (`#/...`) are supported.
 *
 * @param root - root schema document
 * @param ref - `$ref` value
 * @param refPointer - JSON Pointer to the `$ref` keyword, for errors
 * @returns canonical JSON Pointer to the referenced schema, and the schema itself
 * @throws {DecantUnsupportedError} if the reference is to another document, or to an anchor
 * @throws {DecantInvalidSchemaError} if the reference does not resolve
 */
export const resolveRef = (
    root: unknown,
    ref: string,
    refPointer: string
): { pointer: string; schema: unknown } => {
    if (!ref.startsWith('#')) {
        throw new DecantUnsupportedError(
            `Only references within the same document (starting with "#") are supported, found "${ref}"`,
            { pointer: refPointer }
        );
    }
    let fragment: string;
    try {
        fragment = decodeURIComponent(ref.slice(1));
    } catch {
        throw new DecantInvalidSchemaError(`Invalid $ref "${ref}"`, { pointer: refPointer });
    }
    if (fragment !== '' && !fragment.startsWith('/')) {
        throw new DecantUnsupportedError(
            `Only JSON Pointer references are supported, found anchor "${ref}"`,
            { pointer: refPointer }
        );
    }

    let pointer = '#';
    let schema = root;
    const segments = fragment === '' ? [] : fragment.slice(1).split('/');
    for (const segment of segments) {
        const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
        pointer = childPointer(pointer, key);
        if (typeof schema !== 'object' || schema === null || !Object.hasOwn(schema, key)) {
            throw new DecantInvalidSchemaError(
                `$ref "${ref}" does not resolve to a schema in the document`,
                { pointer: refPointer }
            );
        }
        schema = (schema as Record<string, unknown>)[key];
    }
    return { pointer, schema };
};
