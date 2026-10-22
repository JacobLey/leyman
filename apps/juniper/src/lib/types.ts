import type { StandardJSONSchemaV1 } from '@standard-schema/spec';

export declare const typeCache: unique symbol;

/**
 * Value of a JSON Schema `type` keyword.
 */
export type JsonSchemaType =
    | 'array'
    | 'boolean'
    | 'integer'
    | 'null'
    | 'number'
    | 'object'
    | 'string';

export interface JsonSchema<T> {
    [key: string]: unknown;
    [typeCache]?: { type: T };
    allOf?: Omit<JsonSchema<T>, typeof typeCache>[];
    anyOf?: Omit<JsonSchema<T>, typeof typeCache>[];
    dependentSchemas?: Record<string, Omit<JsonSchema<T>, typeof typeCache>>;
    if?: JsonSchema<unknown>;
    else?: JsonSchema<unknown>;
    enum?: readonly unknown[];
    patternProperties?: Record<string, boolean | JsonSchema<unknown>>;
    properties?: Record<string, boolean | JsonSchema<unknown>>;
    then?: JsonSchema<unknown>;
    type?: JsonSchemaType | JsonSchemaType[];
}

/**
 * A schema serialized with `toJSON({ openApi30: true })`. Unlike {@link JsonSchema}, sub-schemas are
 * never `true` or `false`, and `type` is a single type (with `nullable` for `null`), as OpenAPI 3.0
 * requires. So it can be assigned to OpenAPI libraries' 3.0 schema types.
 *
 * @template T - type the schema describes
 */
export interface OpenApi30JsonSchema<T> {
    [key: string]: unknown;
    [typeCache]?: { type: T };
    $ref?: string;
    additionalProperties?: boolean | OpenApi30JsonSchema<unknown>;
    allOf?: OpenApi30JsonSchema<unknown>[];
    anyOf?: OpenApi30JsonSchema<unknown>[];
    // Not `readonly`, which OpenAPI libraries' `enum?: any[]` rejects
    enum?: unknown[];
    items?: OpenApi30JsonSchema<unknown>;
    not?: OpenApi30JsonSchema<unknown>;
    nullable?: boolean;
    oneOf?: OpenApi30JsonSchema<unknown>[];
    properties?: Record<string, OpenApi30JsonSchema<unknown>>;
    type?: Exclude<JsonSchemaType, 'null'>;
}

export interface ToJsonParams {
    /**
     * `$ref` prefix for defined schemas (see `define`).
     * Defaults to `#/$defs/` (embedded as `$defs`), or `#/components/schemas/` for OpenAPI 3.0.
     */
    definitionsPath?: string;
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

export interface Schema<T> extends StandardJSONSchemaV1<T> {
    [typeCache]?: {
        type: T;
    };
    toJSON: {
        (params: ToJsonParams & { openApi30: true }): OpenApi30JsonSchema<T>;
        (params?: ToJsonParams): JsonSchema<T>;
    };
}

export type SchemaType<T> = T extends {
    [typeCache]?: {
        type: infer U;
    };
}
    ? U
    : never;

declare const emptyObject: unique symbol;
export interface EmptyIndex {
    [key: string]: never;
    [emptyObject]?: never;
}

/**
 * An object with no known keys. Unlike `{}`, rejects primitives.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Not an interface, which would lack the implicit index signature to extend `Record<string, unknown>`
export type EmptyObject = { [emptyObject]?: never };

/**
 * Flatten an intersection of object types into a single object type, so editors display
 * `{ a: string; b?: number }` instead of `Partial<{ ... }> & Required<Pick<{ ... }, 'a'>>`.
 *
 * Distributes over unions. Property types, modifiers and index signatures are unchanged,
 * so the result is mutually assignable with `T`. The `EmptyObject` marker key is dropped,
 * and restored as `EmptyObject` if no other keys remain.
 *
 * @template T object type to flatten
 */
export type FlattenObject<T> =
    IsAny<T> extends true
        ? T
        : T extends unknown
          ? [Exclude<keyof T, typeof emptyObject>] extends [never]
              ? EmptyObject
              : { [K in keyof T as K extends typeof emptyObject ? never : K]: T[K] }
          : never;

/**
 * Intersect two types, flattening any resulting object types (see {@link FlattenObject}).
 * Arrays and primitives (e.g. template literals) are intersected as is.
 *
 * Either side being `unknown` returns the other side untouched, so a lone named type
 * (e.g. an interface from `customSchema`) keeps its name.
 *
 * @template A type to intersect
 * @template B type to intersect
 */
export type Intersect<A, B> =
    IsUnknown<A> extends true ? B : IsUnknown<B> extends true ? A : FlattenObjects<A & B>;

type FlattenObjects<T> = T extends readonly unknown[] ? T : T extends object ? FlattenObject<T> : T;

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
 *
 * @template Base Base type to strip out
 * @template Check Type to be stripped of Base
 * @template Stripped convenience value for caching stripped, do not provide
 */
export type AbstractClean<
    Base,
    Check,
    Stripped = Check extends Base & infer U ? U : Check,
> = Stripped extends Base ? Stripped : Check;

export type AbstractStrip<Base, ToStrip, Replacement = never> = Base extends infer U & ToStrip
    ? IsUnknown<U> extends true
        ? Replacement
        : U
    : Base;

/**
 * Append `| null` to type.
 * `true` = add `| null`. Calling `nullable()` is NOOP.
 * `false` = Do not add `| null`. Calling `nullable()` should append `| null`.
 * `boolean` = Do not add `| null`. Calling `nullable()` should not append `| null`.
 *
 * @template T value to have `| null` attached
 * @template N if `true` literal, attach null
 */
export type Nullable<T, N extends boolean> = [N] extends [true] ? T | null : T;

/**
 * Accepts `nullSchema()` in `not` only when the schema is nullable, as it would do nothing otherwise.
 *
 * @template N nullability of the schema `not` is called on
 */
export type NotNullParameter<N extends boolean> = [N] extends [true]
    ? unknown
    : { error: 'Error: schema is not nullable.' };

export type ConditionalNullable<
    Base extends boolean,
    If extends boolean,
    Then extends boolean,
    Else extends boolean,
> = [If] extends [true]
    ? [Then] extends [true]
        ? Base
        : boolean
    : [Else] extends [true]
      ? Base
      : boolean;

export type ToBaseType<T> = T extends never
    ? never
    : T extends boolean
      ? boolean
      : T extends number
        ? number
        : T extends string
          ? string
          : T extends readonly unknown[]
            ? ToBaseType<T[number]>[]
            : T extends Record<string, unknown>
              ? Record<string, unknown>
              : T;

const reservedWordsArr = [
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
] as const;
export const reservedWords = new Set<string>(reservedWordsArr);
export type ReservedWords = (typeof reservedWordsArr)[number];
