import type {
    ConditionalResult,
    SchemaGenerics,
    SchemaParams,
    SerializationParams,
} from '../lib/schema.js';
import type {
    AbstractStrip,
    ConditionalNullable,
    EmptyIndex,
    IsNever,
    JsonSchema,
    Nullable,
    Schema,
    SchemaType,
} from '../lib/types.js';
import { maxInt } from '../lib/constants.js';
import { AbstractSchema } from '../lib/schema.js';
import { mergeAllOf } from '../lib/utils.js';
import { MergeSchema } from './merge.js';
import { NeverSchema } from './never.js';

const dependentRequiredSym = Symbol('dependentRequired');
const dependentSchemasSym = Symbol('dependentSchemas');
const patternPropertiesSym = Symbol('patternProperties');
const ignoreUnevaluatedProperties = Symbol('ignoreUnevaluatedProperties');

const trueSchema = new MergeSchema();
const falseSchema = new NeverSchema();

export type PatternProperties<T extends string> = string & {
    [patternPropertiesSym]?: T;
};

type BaseSchemaObject = Record<string, AbstractSchema<SchemaGenerics<unknown>>>;
type BaseParameterSchemaObject = Record<string, boolean | AbstractSchema<SchemaGenerics<unknown>>>;

type StripBoolean<S extends boolean | Schema<unknown>> = S extends boolean
    ? S extends false
        ? typeof falseSchema
        : typeof trueSchema
    : Exclude<S, boolean>;
type StripBooleanParameterSchemaObject<P extends BaseParameterSchemaObject> = {
    [k in keyof P]: StripBoolean<P[k]>;
};

export type EmptyObject = Omit<EmptyIndex, number | string>;

type StripString<T extends string> = AbstractStrip<T, string>;

/**
 * Required keys `R` that are still properties of `NewP`.
 *
 * @template NewP - properties after picking/omitting
 * @template R - required keys before
 */
type RemainingRequired<NewP extends BaseParameterSchemaObject, R> = Extract<
    R,
    StripString<Extract<keyof NewP, string>>
>;

/**
 * Keys of `P` that may be present, i.e. not set to `false`.
 *
 * @template P - properties
 */
type AllowedKeys<P extends BaseParameterSchemaObject> = StripString<
    Extract<{ [K in keyof P]: P[K] extends false ? never : K }[keyof P], string>
>;

/**
 * Pattern properties of two object schemas combined.
 *
 * @template X - types matched by this schema's `patternProperties`
 * @template X2 - types matched by the added schema's `patternProperties`
 */
type MergedPatternProperties<
    X extends Record<string, unknown>,
    X2 extends Record<string, unknown>,
> = [X2] extends [EmptyIndex] ? X : [X] extends [EmptyIndex] ? X2 : X & X2;

type ObjectType<
    // Properties
    P extends BaseSchemaObject,
    // Required
    R extends StripString<Extract<keyof P, string>>,
    // Additional
    A extends boolean | AbstractSchema<SchemaGenerics<unknown>>,
    // Pattern Properties "regeXp"
    X extends Record<string, unknown>,
    M,
    // Nullable
    N extends boolean,
    Stripped extends AbstractStrip<P, EmptyIndex> = AbstractStrip<P, EmptyObject>,
> = Nullable<
    AbstractStrip<
        AbstractStrip<
            AbstractStrip<X, EmptyIndex, unknown> &
                EmptyObject &
                M &
                ([A] extends [true] ? Record<string, unknown> : unknown) &
                (A extends AbstractSchema<SchemaGenerics<infer V>> ? Record<string, V> : unknown) &
                (IsNever<Stripped> extends true
                    ? unknown
                    : Partial<{
                          [K in keyof Stripped]: SchemaType<Stripped[K]>;
                      }> &
                          Required<
                              Pick<
                                  {
                                      [K in keyof Stripped]: SchemaType<Stripped[K]>;
                                  },
                                  R
                              >
                          >),
            EmptyObject,
            EmptyObject
        >,
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        {},
        EmptyObject
    >,
    N
>;

interface ObjectParams<
    P extends BaseParameterSchemaObject,
    R extends StripString<Extract<keyof P, string>>,
    A extends boolean | AbstractSchema<SchemaGenerics<unknown>>,
    X extends Record<string, unknown>,
    M,
    N extends boolean,
> extends SchemaParams<ObjectType<StripBooleanParameterSchemaObject<P>, R, A, X, M, N>> {
    additionalProperties?: A;
    minProperties?: number;
    maxProperties?: number;
    properties?: P;
    required?: R[];
    unevaluatedProperties?: boolean | typeof ignoreUnevaluatedProperties;
    [dependentRequiredSym]?: Record<string, string[]>;
    [dependentSchemasSym]?: Record<
        string,
        AbstractSchema<SchemaGenerics<Record<string, unknown> | null>>
    >;
    [patternPropertiesSym]?: Record<string, AbstractSchema<SchemaGenerics<unknown>>>;
}

interface ObjectGenerics<
    P extends BaseParameterSchemaObject,
    R extends StripString<Extract<keyof P, string>>,
    A extends boolean | AbstractSchema<SchemaGenerics<unknown>>,
    X extends Record<string, unknown>,
    M,
    N extends boolean,
> extends SchemaGenerics<ObjectType<StripBooleanParameterSchemaObject<P>, R, A, X, M, N>> {
    params: ObjectParams<P, R, A, X, M, N>;
}

// @ts-expect-error
type AnyObjectSchema = ObjectSchema<any, any, any, any, unknown, boolean>;

/**
 * Schema for defining `object` types.
 *
 * @template P
 * @template R
 * @template A
 * @template X
 * @template M
 * @template N
 */
export class ObjectSchema<
    // Properties
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    P extends BaseParameterSchemaObject = {},
    // Required
    R extends StripString<Extract<keyof P, string>> = never,
    // Additional
    A extends boolean | AbstractSchema<SchemaGenerics<unknown>> = boolean,
    // Pattern Properties "regeXp"
    X extends Record<string, unknown> = EmptyIndex,
    // Merged
    M = unknown,
    // Nullable
    N extends boolean = false,
> extends AbstractSchema<ObjectGenerics<P, R, A, X, M, N>> {
    readonly #additionalProperties: A | null;
    readonly #dependentRequired: Record<string, string[]>;
    readonly #dependentSchemas: Record<
        string,
        AbstractSchema<SchemaGenerics<Record<string, unknown> | null>>
    >;
    readonly #patternProperties: Record<string, AbstractSchema<SchemaGenerics<unknown>>>;
    readonly #properties: BaseSchemaObject;
    readonly #maxProperties: number;
    readonly #minProperties: number;
    readonly #required: R[];
    readonly #unevaluatedProperties: boolean | typeof ignoreUnevaluatedProperties;

    protected override readonly schemaType = 'object';

    declare public allOf: <S extends Schema<Record<string, unknown> | null>>(
        this: AnyObjectSchema,
        schema: S
    ) => ObjectSchema<
        P,
        R,
        A,
        X,
        M & NonNullable<SchemaType<S>>,
        null extends SchemaType<S> ? N : boolean
    >;

    declare public anyOf: <S extends Schema<Record<string, unknown> | null>>(
        this: AnyObjectSchema,
        schemas: S[]
    ) => ObjectSchema<
        P,
        R,
        A,
        X,
        M & NonNullable<SchemaType<S>>,
        null extends SchemaType<S> ? N : boolean
    >;

    declare public if: <
        IfP extends BaseParameterSchemaObject,
        IfR extends StripString<Extract<keyof IfP, string>>,
        IfA extends boolean | AbstractSchema<SchemaGenerics<unknown>>,
        IfX extends Record<string, unknown>,
        IfM,
        IfN extends boolean,
        Then extends Schema<Record<string, unknown> | null> = ObjectSchema,
        Else extends Schema<Record<string, unknown> | null> = ObjectSchema,
    >(
        this: AnyObjectSchema,
        schema: ObjectSchema<IfP, IfR, IfA, IfX, IfM, IfN>,
        conditionals: ConditionalResult<Then, Else>
    ) => ObjectSchema<
        P,
        R,
        A,
        X,
        M &
            (
                | NonNullable<SchemaType<Else>>
                | (NonNullable<SchemaType<Then>> &
                      ObjectType<StripBooleanParameterSchemaObject<IfP>, IfR, IfA, IfX, IfM, false>)
            ),
        ConditionalNullable<
            N,
            IfN,
            null extends SchemaType<Then> ? true : boolean,
            null extends SchemaType<Else> ? true : boolean
        >
    >;

    declare public not: <
        NotP extends BaseParameterSchemaObject,
        NotR extends StripString<Extract<keyof NotP, string>>,
        NotN extends boolean,
    >(
        this: AnyObjectSchema,
        schema: ObjectSchema<NotP, NotR, any, any, any, NotN>
    ) => NotN extends true ? ObjectSchema<P, R, A, X, M, boolean> : this;

    declare public nullable: (
        this: AnyObjectSchema
    ) => ObjectSchema<P, R, A, X, M, boolean extends N ? boolean : true>;

    declare public oneOf: <S extends Schema<Record<string, unknown> | null>>(
        this: AnyObjectSchema,
        schemas: S[]
    ) => ObjectSchema<
        P,
        R,
        A,
        X,
        M & NonNullable<SchemaType<S>>,
        null extends SchemaType<S> ? N : boolean
    >;

    /**
     * @override
     */
    public constructor(options: ObjectParams<P, R, A, X, M, N> = {}) {
        super(options);
        this.#additionalProperties = options.additionalProperties ?? null;
        this.#maxProperties = options.maxProperties ?? Number.POSITIVE_INFINITY;
        this.#minProperties = options.minProperties ?? 0;
        this.#properties = {};
        if (options.properties) {
            for (const [key, val] of Object.entries(options.properties)) {
                if (val === true) {
                    this.#properties[key] = trueSchema;
                } else if (val === false) {
                    this.#properties[key] = falseSchema;
                } else {
                    this.#properties[key] = val;
                }
            }
        }
        this.#required = options.required ?? [];
        this.#unevaluatedProperties = options.unevaluatedProperties ?? ignoreUnevaluatedProperties;
        this.#dependentRequired = options[dependentRequiredSym] ?? {};
        this.#dependentSchemas = options[dependentSchemasSym] ?? {};
        this.#patternProperties = options[patternPropertiesSym] ?? {};
    }

    /**
     * Create a new instance of ObjectSchema.
     *
     * @param [options] - optional
     * @param [options.additionalProperties] - allow additional properties
     * @param [options.minProperties] - minimum properties in object (inclusive)
     * @param [options.maxProperties] - maximum properties in object (inclusive)
     * @param [options.properties] - dictionary of property schemas
     * @param [options.title] - Add title to schema
     * @param [options.description] - Add description to schema
     * @param [options.deprecated] - flag schema as deprecated
     * @param [options.readOnly] - value should not be modified
     * @param [options.writeOnly] - value should be hidden
     * @returns new object schema
     */
    public static override create<
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        P2 extends BaseParameterSchemaObject = {},
        R2 extends StripString<Extract<keyof P2, string>> = never,
        A2 extends boolean | AbstractSchema<SchemaGenerics<unknown>> = boolean,
    >(
        this: void,
        options?: ObjectParams<P2, R2, A2, EmptyIndex, unknown, false>
    ): ObjectSchema<P2, R2, A2> {
        return new ObjectSchema(options);
    }

    /**
     * Append `properties` to the object.
     *
     * Properties are "optional" until explicitly required.
     *
     * Duplicate properties are rejected.
     *
     * @see {@link https://json-schema.org/understanding-json-schema/reference/object.html#properties}
     *
     * @param this - this instance
     * @param properties - Schemas keyed by property name
     * @returns cloned object schema
     */
    public properties<T extends BaseParameterSchemaObject>(
        this: this,
        properties: T &
            (keyof P & keyof T extends never
                ? unknown
                : {
                      error: `Error: property "${Extract<keyof P & keyof T, string>}" is already defined.`;
                  })
    ): ObjectSchema<P & T, R, A, X, M, N>;
    /**
     * @inheritdoc
     */
    public properties<T extends BaseParameterSchemaObject>(
        this: this,
        properties: T
    ): ObjectSchema<P & T, R, A, X, M, N> {
        return (this as unknown as ObjectSchema<P & T, R, A, X, M, N>).clone({
            properties: {
                ...(this.#properties as P),
                ...properties,
            },
        });
    }

    /**
     * Set the `maxProperties` of the object.
     * Set to `Infinity` to effectively clear restriction.
     *
     * Does not alter typings.
     * Overwrites existing restriction.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.5.1}
     *
     * @param this - this instance
     * @param maxProperties - maxProperties property
     * @returns cloned object schema
     */
    public maxProperties(this: this, maxProperties: number): this {
        return this.clone({ maxProperties });
    }

    /**
     * Set the `minProperties` of the object.
     * Set to `0` to effectively clear restriction.
     *
     * Does not alter typings.
     * Overwrites existing restriction.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.5.2}
     *
     * @param this - this instance
     * @param minProperties - minProperties property
     * @returns cloned object schema
     */
    public minProperties(this: this, minProperties: number): this {
        return this.clone({ minProperties });
    }

    /**
     * Mark a property as `required`.
     * Requires property schema to already be set.
     * Without `required`, marks every property as required (the inverse of `partial()`),
     * except properties set to `false`, which must stay absent.
     *
     * Extends existing `required`.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.5.3}
     *
     * @param this - this instance
     * @param [required] - required properties, defaults to every property
     * @returns cloned object schema
     */
    public required(this: this): ObjectSchema<P, AllowedKeys<P> | R, A, X, M, N>;
    /**
     * @inheritdoc
     */
    public required<K extends StripString<Extract<keyof P, string>>>(
        this: this,
        required: K | K[]
    ): ObjectSchema<P, K | R, A, X, M, N>;
    /**
     * @inheritdoc
     */
    public required<K extends StripString<Extract<keyof P, string>>>(
        this: this,
        required?: K | K[]
    ): ObjectSchema<P, K | R, A, X, M, N> {
        const added =
            required === undefined
                ? (Object.keys(this.#properties).filter(
                      key => this.#properties[key] !== falseSchema
                  ) as K[])
                : ([required].flat() as K[]);
        return (this as ObjectSchema<P, K | R, A, X, M, N>).clone({
            required: [...this.#required, ...added],
        });
    }

    /**
     * Keep only the given `properties` (and their `required` entries).
     * Every other keyword, such as `additionalProperties`, is kept as is.
     *
     * Constraints added by combining schemas (`allOf`, `dependentRequired`, ...) still apply to the result,
     * in both the JSON Schema and its type.
     *
     * @param this - this instance
     * @param keys - properties to keep
     * @returns cloned object schema
     */
    public pick<K extends StripString<Extract<keyof P, string>>>(
        this: this,
        keys: readonly K[]
    ): ObjectSchema<Pick<P, K>, RemainingRequired<Pick<P, K>, R>, A, X, M, N> {
        const keep = new Set<string>(keys);
        return this.#withProperties(key => keep.has(key)) as unknown as ObjectSchema<
            Pick<P, K>,
            RemainingRequired<Pick<P, K>, R>,
            A,
            X,
            M,
            N
        >;
    }

    /**
     * Remove the given `properties` (and their `required` entries).
     * Every other keyword, such as `additionalProperties`, is kept as is.
     *
     * Constraints added by combining schemas (`allOf`, `dependentRequired`, ...) still apply to the result,
     * in both the JSON Schema and its type.
     *
     * @param this - this instance
     * @param keys - properties to remove
     * @returns cloned object schema
     */
    public omit<K extends StripString<Extract<keyof P, string>>>(
        this: this,
        keys: readonly K[]
    ): ObjectSchema<Omit<P, K>, RemainingRequired<Omit<P, K>, R>, A, X, M, N> {
        const remove = new Set<string>(keys);
        return this.#withProperties(key => !remove.has(key)) as unknown as ObjectSchema<
            Omit<P, K>,
            RemainingRequired<Omit<P, K>, R>,
            A,
            X,
            M,
            N
        >;
    }

    /**
     * Make properties optional, by removing them from `required`.
     * Without `keys`, makes every property optional.
     *
     * Properties required by combined schemas (`allOf`, `dependentRequired`, ...) stay required,
     * in both the JSON Schema and its type.
     *
     * @param this - this instance
     * @param [keys] - properties to make optional, defaults to every property
     * @returns cloned object schema
     */
    public partial<K extends StripString<Extract<keyof P, string>> = R>(
        this: this,
        keys?: readonly K[]
    ): ObjectSchema<P, RemainingRequired<P, Exclude<R, K>>, A, X, M, N> {
        const optional = new Set<string>(keys ?? this.#required);
        return (
            this as unknown as ObjectSchema<P, RemainingRequired<P, Exclude<R, K>>, A, X, M, N>
        ).clone({
            required: this.#required.filter(key => !optional.has(key)) as RemainingRequired<
                P,
                Exclude<R, K>
            >[],
        });
    }

    /**
     * Add the properties (and `required`) of another object schema, such as a shared base.
     * Duplicate properties are rejected.
     *
     * Unlike `allOf`, `additionalProperties` applies to the combined properties, so a closed object stays closed
     * over every property. When `schema` sets `additionalProperties`, `unevaluatedProperties`,
     * `minProperties` or `maxProperties`, its value replaces this schema's.
     * `patternProperties`, `dependentRequired`, `dependentSchemas` and combined schemas (`allOf`, `if`, ...)
     * of both apply to the result.
     * Annotations (`title`, `description`, ...), `nullable` and definitions (`define`) are kept from this schema only.
     *
     * @param this - this instance
     * @param schema - object schema to add
     * @returns cloned object schema
     */
    public extend<
        P2 extends BaseParameterSchemaObject,
        R2 extends StripString<Extract<keyof P2, string>>,
        A2 extends boolean | AbstractSchema<SchemaGenerics<unknown>>,
        X2 extends Record<string, unknown>,
        M2,
    >(
        this: this,
        schema: ObjectSchema<P2, R2, A2, X2, M2, boolean> &
            (keyof P & keyof P2 extends never
                ? unknown
                : {
                      error: `Error: property "${Extract<keyof P & keyof P2, string>}" is already defined.`;
                  })
    ): ObjectSchema<
        P & P2,
        R | R2,
        boolean extends A2 ? A : A2,
        MergedPatternProperties<X, X2>,
        M & M2,
        N
    >;
    /**
     * @inheritdoc
     */
    public extend(this: this, schema: AnyObjectSchema): this {
        const other = schema as this;

        // The same pattern with a different schema: both apply, the other one via `allOf`
        const overlapping: AnyObjectSchema[] = [];
        const patternProperties = { ...this.#patternProperties };
        for (const [pattern, patternSchema] of Object.entries(other.#patternProperties)) {
            const existing = patternProperties[pattern];
            if (existing && existing !== patternSchema) {
                overlapping.push(
                    new ObjectSchema({ [patternPropertiesSym]: { [pattern]: patternSchema } })
                );
            } else {
                patternProperties[pattern] = patternSchema;
            }
        }

        return this.clone({
            ...this.getMergedCompositionParams(other, overlapping),
            additionalProperties: (other.#additionalProperties ?? this.#additionalProperties)!,
            minProperties: other.#minProperties > 0 ? other.#minProperties : this.#minProperties,
            maxProperties:
                other.#maxProperties < Number.POSITIVE_INFINITY
                    ? other.#maxProperties
                    : this.#maxProperties,
            properties: { ...(this.#properties as P), ...other.#properties },
            required: [...this.#required, ...other.#required],
            unevaluatedProperties:
                other.#unevaluatedProperties === ignoreUnevaluatedProperties
                    ? this.#unevaluatedProperties
                    : other.#unevaluatedProperties,
            // Keyed by own properties, which do not overlap
            [dependentRequiredSym]: { ...this.#dependentRequired, ...other.#dependentRequired },
            [dependentSchemasSym]: { ...this.#dependentSchemas, ...other.#dependentSchemas },
            [patternPropertiesSym]: patternProperties,
        });
    }

    /**
     * Set `additionalProperties` of object.
     *
     * Objects that allow additionalProperties will be indexed with and additional
     * `Record<string, unknown>` or `Record<string, SchemaType<Schema>>`.
     *
     * @see {@link https://json-schema.org/understanding-json-schema/reference/object.html#additional-properties}
     *
     * @param this - this instance
     * @param additionalProperties - additionalProperties property
     * @returns cloned object schema
     */
    public additionalProperties<NewA extends boolean | AbstractSchema<SchemaGenerics<unknown>>>(
        this: this,
        additionalProperties: NewA
    ): ObjectSchema<P, R, NewA, X, M, N> {
        return (this as unknown as ObjectSchema<P, R, NewA, X, M, N>).clone({
            additionalProperties,
        });
    }

    /**
     * Appends to `patternProperties`. The key is a RegExp pattern with a value
     * of a JSON Schema.
     *
     * This library is not able to deterministically parse the "type" of the pattern
     * so it relies on manual typing. Use the `PatternProperties` type to case the
     * RegExp pattern to a Typescript string type.
     *
     * This library is not able to detect overlap of patterns, so setting multiple
     * patterns may have unintentional overlap that is not reflected in the typing.
     *
     * __Pattern Properties are not supported in OpenAPI 3.0__
     * They will be ignored entirely.
     *
     * @see {@link https://json-schema.org/understanding-json-schema/reference/object.html#pattern-properties}
     *
     * @example
     * const openApiVendor = objectSchema().patternProperties(
     *     '^x-' as PatternProperties<`x-${string}`>,
     *     unknownSchema()
     * );
     * SchemaType<typeof openApiVendor> // Record<`x-${string}`, unknown>
     *
     * @param this - this instance
     * @param pattern - regexp pattern, typed as PatternProperties
     * @param schema - Json Schema
     * @returns cloned object schema
     */
    public patternProperties<
        Pattern extends PatternProperties<string>,
        S extends boolean | Schema<unknown>,
    >(
        this: this,
        pattern: Pattern,
        schema: S
    ): ObjectSchema<
        P,
        R,
        A,
        AbstractStrip<X, EmptyIndex, unknown> &
            Record<NonNullable<Pattern[typeof patternPropertiesSym]>, SchemaType<StripBoolean<S>>>,
        M,
        N
    > {
        let patternSchema: Schema<unknown>;
        if (schema === true) {
            patternSchema = trueSchema;
        } else if (schema === false) {
            patternSchema = falseSchema;
        } else {
            patternSchema = schema;
        }

        return (
            this as ObjectSchema<
                P,
                R,
                A,
                AbstractStrip<X, EmptyIndex, unknown> &
                    Record<
                        NonNullable<Pattern[typeof patternPropertiesSym]>,
                        SchemaType<StripBoolean<S>>
                    >,
                M,
                N
            >
        ).clone({
            [patternPropertiesSym]: {
                ...this.#patternProperties,
                [pattern]: patternSchema as AbstractSchema<
                    SchemaGenerics<SchemaType<StripBoolean<S>>>
                >,
            },
        });
    }

    /**
     * Add a `dependentRequired` property to the JSON schema.
     *
     * @see {@link https://json-schema.org/understanding-json-schema/reference/conditionals.html#dependentrequired}
     *
     * @param this - this instance
     * @param key - property of object that if exists, `dependents` are required.
     * @param dependents - dependents that are required if `key` exists.
     * @returns cloned object schema
     */
    public dependentRequired<
        K extends string & Extract<keyof P, string>,
        D extends Exclude<Extract<keyof P, string>, K>,
    >(
        this: this,
        key: K,
        dependents: D[]
    ): ObjectSchema<
        P,
        R,
        A,
        X,
        M &
            (
                | Partial<Record<K, never>>
                | {
                      [k in D]: SchemaType<StripBooleanParameterSchemaObject<P>[k]>;
                  }
            ),
        N
    > {
        return this.clone({
            [dependentRequiredSym]: {
                ...this.#dependentRequired,
                [key]: [...dependents],
            },
        });
    }

    /**
     * Add a `dependentSchema` property to the JSON schema.
     *
     * @see {@link https://json-schema.org/understanding-json-schema/reference/conditionals.html#dependentschemas}
     *
     * @param this - this instance
     * @param key - property of object that if exists, `schema` is applied.
     * @param schema - schema that is applied if `key` exists.
     * @returns cloned  object schema
     */
    public dependentSchemas<
        K extends string & Extract<keyof P, string>,
        S extends AbstractSchema<SchemaGenerics<Record<string, unknown> | null>>,
    >(
        this: this,
        key: K,
        schema: S
    ): ObjectSchema<P, R, A, X, M & (NonNullable<SchemaType<S>> | Partial<Record<K, never>>), N> {
        return this.clone({
            [dependentSchemasSym]: {
                ...this.#dependentSchemas,
                [key]: schema,
            },
        });
    }

    /**
     * Set `unevaluatedProperties` property on the JSON schema.
     *
     * @see {@link https://json-schema.org/understanding-json-schema/reference/object.html#unevaluated-properties}
     *
     * @param this - this instance
     * @param unevaluatedProperties - allow unevaluated properties
     * @returns cloned object schema
     */
    public unevaluatedProperties(this: this, unevaluatedProperties: boolean): this {
        return this.clone({
            unevaluatedProperties,
        });
    }

    /**
     * @override
     */
    protected override getCloneParams(): Required<ObjectParams<P, R, A, X, M, N>> {
        return {
            ...super.getCloneParams(),
            additionalProperties: this.#additionalProperties!,
            minProperties: this.#minProperties,
            maxProperties: this.#maxProperties,
            properties: { ...(this.#properties as P) },
            required: [...this.#required],
            unevaluatedProperties: this.#unevaluatedProperties,
            [dependentRequiredSym]: { ...this.#dependentRequired },
            [dependentSchemasSym]: { ...this.#dependentSchemas },
            [patternPropertiesSym]: { ...this.#patternProperties },
        };
    }

    /**
     * @override
     */
    protected static override getDefaultValues(
        params: SerializationParams
    ): Record<string, unknown> {
        return {
            ...super.getDefaultValues(params),
            minProperties: 0,
            maxProperties: maxInt,
        };
    }

    /**
     * @override
     */
    protected override toSchema(params: SerializationParams): JsonSchema<SchemaType<this>> {
        const base = super.toSchema(params);

        if (this.#additionalProperties !== null) {
            base.additionalProperties =
                typeof this.#additionalProperties === 'boolean'
                    ? this.#additionalProperties
                    : ObjectSchema.getSchema(this.#additionalProperties, params);
        }
        if (this.#minProperties > 0) {
            base.minProperties = this.#minProperties;
        }
        if (this.#maxProperties < Number.POSITIVE_INFINITY) {
            base.maxProperties = this.#maxProperties;
        }

        const schemaToProperty = (
            schema: AbstractSchema<SchemaGenerics<unknown>>
        ): boolean | JsonSchema<unknown> => {
            // OpenAPI 3.0 schemas must be objects, so use the object equivalent of `true`/`false`
            if (schema === trueSchema) {
                return params.openApi30 ? {} : true;
            }
            if (schema === falseSchema) {
                return params.openApi30 ? { not: {} } : false;
            }
            return ObjectSchema.getSchema(schema, params);
        };

        const propertyEntries = Object.entries(this.#properties);
        if (propertyEntries.length > 0) {
            const properties: Record<string, boolean | JsonSchema<unknown>> = {};
            for (const [key, val] of propertyEntries) {
                properties[key] = schemaToProperty(val);
            }
            base.properties = properties;
        }

        if (this.#required.length > 0) {
            base.required = [...new Set(this.#required)];
        }

        const dependentRequiredEntries = Object.entries(this.#dependentRequired);
        const compositionParams = {
            ...params,
            composition: {
                type: this.schemaType,
                nullable: false,
            },
        };
        const dependentSchemasEntries = Object.entries(this.#dependentSchemas).map(
            ([key, schema]) =>
                [key, (schema as ObjectSchema).getChildSchema(compositionParams)] as const
        );
        if (params.openApi30) {
            const [anyOf, ...anyOfs] = [
                ...dependentRequiredEntries.map(([key, dependent]) => ({
                    anyOf: [{ not: { required: [key] } }, { required: dependent }],
                })),
                ...dependentSchemasEntries.map(([key, dependent]) => ({
                    anyOf: [{ not: { required: [key] } }, dependent],
                })),
            ];
            if (anyOf) {
                if (base.anyOf) {
                    anyOfs.unshift(anyOf);
                } else {
                    Object.assign(base, anyOf);
                }
                mergeAllOf(base, anyOfs);
            }
        } else {
            if (dependentRequiredEntries.length > 0) {
                base.dependentRequired = this.#dependentRequired;
            }
            if (dependentSchemasEntries.length > 0) {
                base.dependentSchemas = {};
                for (const [key, schema] of dependentSchemasEntries) {
                    base.dependentSchemas[key] = schema;
                }
            }

            if (this.#unevaluatedProperties !== ignoreUnevaluatedProperties) {
                base.unevaluatedProperties = this.#unevaluatedProperties;
            }

            const patternEntries = Object.entries(this.#patternProperties);
            if (patternEntries.length > 0) {
                const patternProperties: Record<string, boolean | JsonSchema<unknown>> = {};
                for (const [key, val] of patternEntries) {
                    patternProperties[key] = schemaToProperty(val);
                }
                base.patternProperties = patternProperties;
            }
        }

        return base;
    }

    /**
     * Clone with only the properties (and `required` entries) whose key passes `filter`.
     *
     * @param filter - whether to keep the property
     * @returns cloned object schema
     */
    #withProperties(filter: (key: string) => boolean): this {
        return this.clone({
            properties: Object.fromEntries(
                Object.entries(this.#properties).filter(([key]) => filter(key))
            ) as P,
            required: this.#required.filter(key => filter(key)),
        });
    }
}
