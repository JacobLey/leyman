import type { Dialect } from './keywords.js';
import { GeneverUnsupportedError } from './errors.js';
import { isSchemaObject } from './read-keyword.js';

/**
 * Methods of a path item, each of which may hold an operation.
 */
export const methods = [
    'get',
    'put',
    'post',
    'delete',
    'options',
    'head',
    'patch',
    'trace',
] as const;

/**
 * Whether the input is an OpenAPI document rather than a schema, and which dialect its schemas use.
 *
 * A JSON Schema has no `openapi` keyword, so its presence marks a document.
 *
 * @param input - parsed input file
 * @returns dialect of the document's schemas, or `null` if the input is not an OpenAPI document
 * @throws {GeneverUnsupportedError} if the document is not OpenAPI 3.0 or 3.1
 */
export const openApiDialect = (input: unknown): Dialect | null => {
    if (!isSchemaObject(input) || input.openapi === undefined) {
        return null;
    }
    const version =
        typeof input.openapi === 'string' ? input.openapi : JSON.stringify(input.openapi);
    if (version.startsWith('3.0.')) {
        return 'openapi-3.0';
    }
    if (version.startsWith('3.1.')) {
        return 'openapi-3.1';
    }
    throw new GeneverUnsupportedError(
        `Only OpenAPI 3.0 and 3.1 documents are supported, found "${version}"`,
        { pointer: '#/openapi' }
    );
};
