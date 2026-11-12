import { XeneverInvalidSchemaError } from '#internal/lib/errors.js';

/**
 * Path to a property of the construct at `path`, as a JSON Pointer into the schema value (`/` is the root).
 *
 * @param path - path to the construct
 * @param key - its property or index
 * @returns path to the property
 */
export const childPath = (path: string, key: number | string): string =>
    `${path === '/' ? '' : path}/${key}`;

/**
 * Throws that the schema value is invalid.
 *
 * @param message - what is wrong
 * @param path - path to the construct
 * @throws {XeneverInvalidSchemaError} always
 */
export const invalidSchema = (message: string, path: string): never => {
    throw new XeneverInvalidSchemaError(message, { path });
};

/**
 * Checks that a schema construct is an object with only known properties: a misspelled option would
 * otherwise be ignored without a word.
 *
 * @param value - the construct
 * @param allowed - its known properties
 * @param path - path to it
 * @returns the construct, as a record
 * @throws {XeneverInvalidSchemaError} when it isn't an object, or has an unknown property
 */
export const checkObject = (
    value: unknown,
    allowed: readonly string[],
    path: string
): Readonly<Record<string, unknown>> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        invalidSchema('Expected an object', path);
    }
    const record = value as Readonly<Record<string, unknown>>;
    for (const key of Object.keys(record)) {
        if (!allowed.includes(key)) {
            invalidSchema(`Unknown property \`${key}\``, path);
        }
    }
    return record;
};

/**
 * Checks that a property, when present, is a non-negative integer.
 *
 * @param value - the property
 * @param path - path to it
 * @param minimum - smallest allowed value
 * @returns the integer, or `undefined` when absent
 * @throws {XeneverInvalidSchemaError} when it isn't an integer of at least `minimum`
 */
export const checkInteger = (value: unknown, path: string, minimum = 0): number | undefined => {
    if (value !== undefined && !(Number.isSafeInteger(value) && (value as number) >= minimum)) {
        invalidSchema(`Expected an integer of at least ${minimum}`, path);
    }
    return value as number | undefined;
};

/**
 * Checks that a property, when present, is a string.
 *
 * @param value - the property
 * @param path - path to it
 * @returns the string, or `undefined` when absent
 * @throws {XeneverInvalidSchemaError} when it isn't a string
 */
export const checkString = (value: unknown, path: string): string | undefined => {
    if (value !== undefined && typeof value !== 'string') {
        invalidSchema('Expected a string', path);
    }
    return value as string | undefined;
};

/**
 * Checks that a property, when present, is a boolean.
 *
 * @param value - the property
 * @param path - path to it
 * @returns the boolean, `false` when absent
 * @throws {XeneverInvalidSchemaError} when it isn't a boolean
 */
export const isFlagged = (value: unknown, path: string): boolean => {
    if (value !== undefined && typeof value !== 'boolean') {
        invalidSchema('Expected a boolean', path);
    }
    return value === true;
};

/**
 * Checks that a property is an array.
 *
 * @param value - the property
 * @param path - path to it
 * @returns it, as an array
 * @throws {XeneverInvalidSchemaError} when it isn't an array
 */
export const checkArray = (value: unknown, path: string): readonly unknown[] => {
    if (!Array.isArray(value)) {
        invalidSchema('Expected an array', path);
    }
    return value as readonly unknown[];
};
