type Values<T> = T[Extract<keyof T, string>];

type IfEmpty<Enum extends object, Else> =
    // eslint-disable-next-line @typescript-eslint/no-generated-empty-object-type -- Only an empty enum is assignable from `{}`
    Record<never, string> extends Enum ? [] : Else;

/**
 * List key-value pairs of enum, in order that they occur.
 *
 * @example
 * enum MyEnum {
 *    FOO = 'BAR',
 *    ABC = 123,
 * }
 * console.log(enumToArray(MyEnum));
 * // [{ key: 'FOO', value: 'BAR' }, { key: 'ABC', value: 123 }]
 *
 * @param enumDict - enum variable
 * @returns list of key+value
 */
export const enumToArray = <Enum extends object>(
    enumDict: Enum
): IfEmpty<
    Enum,
    Values<{
        [key in keyof Enum]: number extends key ? never : { key: key; value: Enum[key] };
    }>[]
> => {
    const knownValues: {
        value: unknown;
        key: string;
    }[] = [];

    const entries = enumDict as Record<string, unknown>;
    for (const [key, value] of Object.entries(entries)) {
        // Non-string members get a reverse mapping (`{ FOO: 0, 0: 'FOO' }`),
        // identified by pointing back at a member whose stringified value is that key.
        const isReverseMapping =
            typeof value === 'string' &&
            Object.hasOwn(entries, value) &&
            typeof entries[value] !== 'string' &&
            String(entries[value]) === key;
        if (!isReverseMapping) {
            knownValues.push({ key, value });
        }
    }

    return knownValues as IfEmpty<
        Enum,
        Values<{
            [key in keyof Enum]: number extends key ? never : { key: key; value: Enum[key] };
        }>[]
    >;
};

/**
 * List only values of enum, in order that they are provided.
 * Light wrapper around `enumToArray`.
 *
 * Optionally return unique list of values by passing `{ unique: true }`
 * as second parameter.
 * Unique sets will be "in order" with exception of duplicate values are omitted.
 *
 * @example
 * enum MyEnum {
 *    FOO = 'BAR',
 *    ABC = 123,
 *    DUP = FOO,
 * }
 * console.log(enumToValues(MyEnum));
 * // ['BAR', 123, 'BAR']
 * console.log(enumToValues(MyEnum, { unique: true }));
 * // ['BAR', 123]
 *
 * @param enumDict - enum variable
 * @param [options] - optional
 * @param [options.unique] - Dedupe values in enums, defaults to false
 * @returns list of enum values
 */
export const enumToValues = <Enum extends object>(
    enumDict: Enum,
    {
        unique = false,
    }: {
        /**
         * Dedupe values in enums.
         */
        unique?: boolean;
    } = {}
): IfEmpty<
    Enum,
    Values<{
        [key in keyof Enum]: number extends key ? never : Enum[key];
    }>[]
> => {
    const arr = enumToArray(enumDict).map(v => v.value);

    return (unique ? [...new Set(arr)] : arr) as IfEmpty<
        Enum,
        Values<{
            [key in keyof Enum]: number extends key ? never : Enum[key];
        }>[]
    >;
};

/**
 * List only keys of enum, in order that they are provided.
 * Light wrapper around `enumToArray`.
 *
 * @example
 * enum MyEnum {
 *    FOO = 'BAR',
 *    ABC = 123,
 * }
 * console.log(enumToKeys(MyEnum));
 * // ['FOO', 'ABC']
 *
 * @param enumDict - enum variable
 * @returns list of enum keys
 */
export const enumToKeys = <Enum extends object>(enumDict: Enum): IfEmpty<Enum, (keyof Enum)[]> =>
    enumToArray(enumDict).map(v => v.key) as IfEmpty<Enum, (keyof Enum)[]>;
