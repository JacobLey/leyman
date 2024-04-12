import type { JsonSchema } from './types.js';

/**
 * Check if schemas are deeply equal.
 *
 * @param a - first value to compare
 * @param b - second value to compare
 * @returns are deeply equal
 */
const deepStrictEqual = (a: unknown, b: unknown): boolean => {
    if (typeof a === 'object' && a !== null) {
        if (typeof b !== 'object' || b === null) {
            return false;
        }
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        return (
            aKeys.length === bKeys.length &&
            aKeys.every(key =>
                deepStrictEqual(
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
        let i = 0;
        const schemaKeys = new Set(Object.keys(schema));
        while (true) {
            const baseAll = baseAllOf[i];
            if (
                !(
                    baseAll &&
                    Object.keys(baseAll).some(
                        key =>
                            schemaKeys.has(key) &&
                            !deepStrictEqual(schema[key], baseAll[key])
                    )
                )
            ) {
                break;
            }
            ++i;
        }
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
 * @returns json schema with `$ref`
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
        if (!deepStrictEqual(baseSchema[baseKey], refSchema[baseKey])) {
            output[baseKey] = baseSchema[baseKey];
        }
    }

    for (const refKey of Object.keys(refSchema)) {
        if (!(refKey in baseSchema) && refKey in defaultValues) {
            output[refKey] = defaultValues[refKey];
        }
    }

    return {
        ...output,
        $ref: refPath,
    };
};
