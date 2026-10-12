type ValueOf<T> = Extract<T[keyof T], string>;

export type AvailableProperties<T> = ValueOf<{
    [key in keyof T]: T[key] extends never ? never : key;
}>;

/**
 * Flatten an intersection into a single object type, for expected types whose index signatures
 * conflict with their properties, so cannot be written as a type literal.
 *
 * @template T intersection to flatten
 */
export type Flatten<T> = { [K in keyof T]: T[K] };
