import type { JsonSchema } from './types.js';

/**
 * Check if schemas are deeply equal.
 *
 * @param a - first value to compare
 * @param b - second value to compare
 * @returns are deeply equal
 */
const isDeepStrictEqual = (a: unknown, b: unknown): boolean => {
    if (typeof a === 'object' && a !== null) {
        if (typeof b !== 'object' || b === null) {
            return false;
        }
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        return (
            aKeys.length === bKeys.length &&
            aKeys.every(key =>
                isDeepStrictEqual(
                    (a as Record<string, unknown>)[key],
                    (b as Record<string, unknown>)[key]
                )
            )
        );
    }
    return a === b;
};

/**
 * Merge and `allOf` schema with existing schema's `allOf`.
 *
 * Optimization to re-use schema objects.
 *
 * __Modifies schema in place.__
 *
 * Also returns object for convenience.
 *
 * @example
 * mergeAllOf(
 *     {
 *         type: 'string',
 *         allOf: [{ pattern: 'a' }, { pattern: 'b' }],
 *     },
 *     [{ minLength: 1 }, { maxLength: 5 }, { enum: ['abc', 'abcd'] }]
 * ) -> {
 *     type: 'string',
 *     allOf: [
 *         { pattern: 'a', minLength: 1 },
 *         { pattern: 'b', maxLength: 5 },
 *         { enum: ['abc', 'abcd'] }
 *     ]
 * }
 *
 * @param base - base schema object. Modified in place.
 * @param allOf - schema objects to append/merge to `allOf`.
 * @returns base object, with `allOf` merged
 */
export const mergeAllOf = <S extends JsonSchema<any>>(
    base: S,
    allOf: NonNullable<S['allOf']>
): S => {
    if (allOf.length === 0) {
        return base;
    }
    const { allOf: baseAllOf = [] } = base;
    for (const schema of allOf) {
        const schemaKeys = new Set(Object.keys(schema));
        // Merge into the first `allOf` entry that does not set any of the same keys differently
        const compatibleIndex = baseAllOf.findIndex(baseAll =>
            Object.keys(baseAll).every(
                key => !schemaKeys.has(key) || isDeepStrictEqual(schema[key], baseAll[key])
            )
        );
        const i = compatibleIndex === -1 ? baseAllOf.length : compatibleIndex;
        baseAllOf[i] = {
            ...baseAllOf[i],
            ...schema,
        };
    }
    base.allOf = baseAllOf;
    return base;
};

/**
 * Dedupe attributes between `$ref` and schema.
 * Apply defaults in case of "hidden" properties.
 *
 * @param params - required params
 * @param params.baseSchema - schema that includes `$ref`
 * @param params.defaultValues - dictionary of default values (defined per schema)
 * @param params.refPath - path to ref
 * @param params.refSchema - schema pointed to by `$ref`
 * @returns JSON schema with `$ref`
 */
export const mergeRef = <T>({
    baseSchema,
    defaultValues,
    refPath,
    refSchema,
}: {
    baseSchema: JsonSchema<T>;
    defaultValues: Record<string, unknown>;
    refPath: string;
    refSchema: JsonSchema<T>;
}): JsonSchema<T> => {
    const output: JsonSchema<T> = {};

    const baseKeys = Object.keys(baseSchema);

    for (const baseKey of baseKeys) {
        if (!isDeepStrictEqual(baseSchema[baseKey], refSchema[baseKey])) {
            output[baseKey] = baseSchema[baseKey];
        }
    }

    for (const refKey of Object.keys(refSchema)) {
        if (!Object.hasOwn(baseSchema, refKey) && Object.hasOwn(defaultValues, refKey)) {
            output[refKey] = defaultValues[refKey];
        }
    }

    return {
        ...output,
        $ref: refPath,
    };
};

/**
 * Deep copy of the plain objects and arrays in serialized JSON. Other values (e.g. a `Date` in metadata) are kept as is.
 *
 * Serializing may place a schema's own arrays and objects (e.g. `examples`) in the output, or the same object in several
 * places. Copying once, as the JSON leaves Juniper, keeps the schema immutable however the output is modified.
 *
 * @param value - serialized JSON
 * @returns copy that shares no objects with the schema, or within itself
 */
export const copyJson = <T>(value: T): T => {
    if (Array.isArray(value)) {
        return value.map(item => copyJson<unknown>(item)) as T;
    }
    if (value !== null && typeof value === 'object') {
        const prototype: unknown = Object.getPrototypeOf(value);
        if (prototype === null || prototype === Object.prototype) {
            // Spread keeps symbol keys, which `customSchema` passes through
            const copy = { ...value } as Record<string, unknown>;
            for (const key of Object.keys(copy)) {
                copy[key] = copyJson(copy[key]);
            }
            return copy as T;
        }
    }
    return value;
};
