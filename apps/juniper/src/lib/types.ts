export declare const typeCache: unique symbol;

export interface JsonSchema<T> {
    [key: string]: unknown;
    [typeCache]?: { type: T };
    allOf?: Omit<JsonSchema<T>, typeof typeCache>[];
    anyOf?: Omit<JsonSchema<T>, typeof typeCache>[];
    dependentSchemas?: Record<string, Omit<JsonSchema<T>, typeof typeCache>>;
    if?: JsonSchema<any>;
    else?: JsonSchema<any>;
    enum?: readonly unknown[];
    patternProperties?: Record<string, boolean | JsonSchema<unknown>>;
    properties?: Record<string, boolean | JsonSchema<unknown>>;
    then?: JsonSchema<any>;
    type?: string | string[];
}

export interface ToJsonParams {
    /**
     * $id of schema
     */
    id?: string;
    /**
     * Use syntax complaint with OpenAPI 3.0.
     */
    openApi30?: boolean;
    /**
     * Include `$schema` keyword for draft 2020-12.
     */
    schema?: boolean;
}

export interface Schema<T> {
    [typeCache]?: {
        type: T;
    };
    toJSON: (params?: ToJsonParams) => JsonSchema<T>;
}

export type SchemaType<T> = T extends {
    [typeCache]?: {
        type: infer U;
    };
} ? U : never;

declare const emptyObject: unique symbol;
export interface EmptyIndex {
    [key: string]: never;
    [emptyObject]?: never;
}

// From `expect-types`
type Not<T extends boolean> = T extends true ? false : true;
export type IsNever<T> = [T] extends [never] ? true : false;
export type IsAny<T> = [T] extends [typeof typeCache] ? Not<IsNever<T>> : false;
export type IsUnknown<T> = [unknown] extends [T] ? Not<IsAny<T>> : false;

/**
 * "Clean" a type from a definition.
 * Generally used for "prettifying" types, not actual logic changing.
 *
 * e.g. AbstractClean<number, number & 123> => 123
 */
export type AbstractClean<
    Base,
    Check,
    Stripped = Check extends Base & infer U ? U : Check
> = Stripped extends Base ? Stripped : Check;

export type AbstractStrip<
    Base,
    ToStrip,
    Replacement = never
> = Base extends infer U & ToStrip ?
    (IsUnknown<U> extends true ? Replacement : U) :
    Base;

/**
 * Append `| null` to type.
 * `true` = add `| null`. Calling `nullable()` is NOOP.
 * `false` = Do not add `| null`. Calling `nullable()` should append `| null`.
 * `boolean` = Do not add `| null`. Calling `nullable()` should not append `| null`.
 */
export type Nullable<
    T,
    N extends boolean
> = [N] extends [true] ? T | null : T;

export type ConditionalNullable<
    Base extends boolean,
    If extends boolean,
    Then extends boolean,
    Else extends boolean
> = ([If] extends [true] ?
    ([Then] extends [true] ? Base : boolean)
    : ([Else] extends [true] ? Base : boolean));

export type ToBaseType<T> =
    T extends never ? never :
        T extends boolean ? boolean :
            T extends number ? number :
                T extends string ? string :
                    T extends readonly unknown[] ? ToBaseType<T[number]>[] :
                        T extends Record<string, unknown> ? Record<string, unknown> : T;

declare const reservedWords: [
    // Generic
    '$schema',
    '$id',
    'default',
    'description',
    'example',
    'examples',
    'nullable',
    'title',
    'type',

    // Composition
    'allOf',
    'anyOf',
    'else',
    'if',
    'not',
    'oneOf',
    'then',

    // Enum
    'enum',
    'const',

    // Object
    'maxProperties',
    'minProperties',
    'properties',
    'patternProperties',
    'required',
    'dependentRequired',
    'dependentSchemas',
    'unevaluatedProperties',

    // Array
    'items',
    'maxItems',
    'minItems',
    'prefixItems',
    'uniqueItems',

    // Number
    'exclusiveMaximum',
    'exclusiveMinimum',
    'maximum',
    'minimum',
    'multipleOf',

    // String
    'contentEncoding',
    'contentMediaType',
    'format',
    'maxLength',
    'minLength',
    'pattern',
];
export type ReservedWords = typeof reservedWords[number];
