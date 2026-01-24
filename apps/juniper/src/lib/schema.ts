import type { JsonSchema, ReservedWords, SchemaType, ToJsonParams, typeCache } from './types.js';
import { reservedWords } from './types.js';
import { mergeAllOf, mergeRef } from './utils.js';

const allOfSym = Symbol('allOf');
const anyOfSym = Symbol('anyOf');
const conditionalsSym = Symbol('conditional');
const examplesSym = Symbol('examples');
const metadataSym = Symbol('metadata');
const notSym = Symbol('not');
const nullableSym = Symbol('nullable');
const oneOfSym = Symbol('oneOf');
const refSym = Symbol('ref');

export interface SchemaParams<T> {
    default?: T;
    deprecated?: boolean;
    description?: string | null;
    readOnly?: boolean;
    writeOnly?: boolean;
    title?: string | null;
    [allOfSym]?: AbstractSchema<SchemaGenerics<T>>[];
    [anyOfSym]?: AbstractSchema<SchemaGenerics<T>>[][];
    [conditionalsSym]?: {
        if: AbstractSchema<SchemaGenerics<T>>;
        then: AbstractSchema<SchemaGenerics<T>> | null;
        else: AbstractSchema<SchemaGenerics<T>> | null;
    }[];
    [examplesSym]?: T[];
    [metadataSym]?: Record<string, unknown>;
    [notSym]?: AbstractSchema<SchemaGenerics<T>>[];
    [nullableSym]?: boolean;
    [oneOfSym]?: AbstractSchema<SchemaGenerics<T>>[][];
    [refSym]?: {
        path: string;
        schema: AbstractSchema<SchemaGenerics<T>>;
    } | null;
}

export interface SchemaGenerics<T> {
    type: T;
    params: SchemaParams<this['type']>;
}

export type ConditionalResult<T, E = T> =
    | {
          then: T;
          else: E;
      }
    | {
          then: T;
          else?: null;
      }
    | {
          then?: null;
          else: E;
      };

export interface SerializationParams {
    /**
     * Inside composition (e.g. `allOf`).
     *
     * Pass base type information to prevent unnecessary duplicates.
     */
    composition?: {
        type: string | null;
        nullable: boolean;
    };
    /**
     * Comply with OpenAPI 3.0 spec.
     */
    openApi30: boolean;
}

/**
 * Base class for JSON Schema generation and serialization.
 *
 * @template T
 */
export abstract class AbstractSchema<T extends SchemaGenerics<any>> {
    /**
     * "Abstract" convenient wrapper around `new` keyword.
     *
     * Child classes MUST implement method with proper typings.
     *
     * @param options - constructor parameters
     * @returns new schema instance
     */
    protected declare static create: (this: void, options?: any) => AbstractSchema<any>;

    readonly #allOf: AbstractSchema<T>[];
    readonly #anyOf: AbstractSchema<T>[][];
    readonly #conditionals: NonNullable<SchemaParams<any>[typeof conditionalsSym]>;
    readonly #default: T['type'] | undefined;
    readonly #deprecated: boolean;
    readonly #description: string | null;
    readonly #examples: T['type'][];
    readonly #metadata: Record<string, unknown>;
    readonly #nots: AbstractSchema<T>[];
    readonly #nullable: boolean;
    readonly #oneOf: AbstractSchema<T>[][];
    readonly #readOnly: boolean;
    readonly #ref: {
        path: string;
        schema: AbstractSchema<T>;
    } | null;
    readonly #title: string | null;
    readonly #writeOnly: boolean;

    protected declare readonly schemaType?: string;

    /**
     * Used to store type information.
     * Not actually defined and should not be accessed via JS.
     */
    public declare readonly [typeCache]: T;

    /**
     * Create instance of Schema. See `create` for convenient wrapper.
     *
     * @param [options] - optional
     * @param [options.title] - Add title to schema
     * @param [options.description] - Add description to schema
     * @param [options.deprecated] - flag schema as deprecated
     * @param [options.readOnly] - value should not be modified
     * @param [options.writeOnly] - value should be hidden
     * @returns new schema instance
     */
    public constructor(options: T['params'] = {}) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        this.#default = options.default;
        this.#deprecated = options.deprecated ?? false;
        this.#description = options.description ?? null;
        this.#readOnly = options.readOnly ?? false;
        this.#title = options.title ?? null;
        this.#writeOnly = options.writeOnly ?? false;
        this.#allOf = (options[allOfSym] ?? []) as AbstractSchema<T>[];
        this.#anyOf = (options[anyOfSym] ?? []) as AbstractSchema<T>[][];
        this.#conditionals = options[conditionalsSym] ?? [];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        this.#examples = options[examplesSym] ?? [];
        this.#metadata = options[metadataSym] ?? {};
        this.#nots = (options[notSym] ?? []) as AbstractSchema<T>[];
        this.#nullable = options[nullableSym] ?? false;
        this.#oneOf = (options[oneOfSym] ?? []) as AbstractSchema<T>[][];
        this.#ref = (options[refSym] ?? null) as {
            path: string;
            schema: AbstractSchema<T>;
        } | null;
    }

    /**
     * A dictionary of "default" values for a schema. Only need to include
     * those that are omitted from a schema when at a certain value.
     *
     * e.g. StringSchema omits `minProperties` when set to `0`.
     *
     * Used by `$ref` to ensure defaulted properties are not mistakenly overwritten
     * by the referenced schema.
     *
     * Child classes SHOULD extend this response when implementing default-able properties.
     *
     * @returns map of property name -> default value.
     */
    protected static getDefaultValues(params: SerializationParams): Record<string, unknown>;
    protected static getDefaultValues(): Record<string, unknown> {
        return {
            deprecated: false,
            description: null,
            readOnly: false,
            title: null,
            writeOnly: false,
        };
    }

    /**
     * Generate the JSON Schema document.
     *
     * The output will be an object, but not much else should be inferred about the
     * response. It should instead be passed to a validator library like [ajv](https://www.npmjs.com/package/ajv)
     * or serialized for export.
     *
     * The structure being described by the schema can be extracted via `SchemaType`.
     *
     * @example
     * const schema = StringSchema.create().enums(['a', 'b'] as const).toJSON();
     * type MyString = SchemaType<typeof schema>; // 'a' | 'b'
     *
     * @param [options] - optional
     * @param [options.id] - $id property of schema
     * @param [options.openApi30=false] - Use syntax complaint with OpenAPI 3.0.
     * @param [options.schema=false] - Include `$schema` keyword for draft 2020-12.
     * @returns serializable JSON Schema
     */
    public toJSON({
        id,
        openApi30 = false,
        schema = false,
    }: ToJsonParams = {}): JsonSchema<T['type']> {
        const base = this.getChildSchema<T['type']>({ openApi30 });
        if (!openApi30) {
            if (id) {
                base.$id = id;
            }
            if (schema) {
                base.$schema = 'https://json-schema.org/draft/2020-12/schema';
            }
        }
        return base;
    }

    /**
     * Set the `title` of the schema.
     * Use `null` to effectively unset.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.1}
     *
     * @param this - this instance
     * @param title - title property
     * @returns cloned schema
     */
    public title(this: this, title: string | null): this {
        return this.clone({ title });
    }

    /**
     * Set the `description` of the schema.
     * Use `null` to effectively unset.
     *
     * While multiline may be supported, whitespace itself is not trimmed.
     * Refer to a library like [dedent](https://www.npmjs.com/package/dedent) for this functionality.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.1}
     *
     * @param this - this instance
     * @param description - description property
     * @returns cloned schema
     */
    public description(this: this, description: string | null): this {
        return this.clone({ description });
    }

    /**
     * Set the `default` of the schema.
     * Omit parameter to unset.
     *
     * Application of the `default` value is implementation-specific, so does not alter typings.
     * Overwrites existing default.
     *
     * Default is not type checked against future settings, so it is possible to set a valid
     * default that becomes invalid with more restrictions.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.2}
     *
     * @param this - this instance
     * @param [val] - default value of schema
     * @returns cloned schema
     */
    public default(this: this, val?: T['type']): this {
        return this.clone({ default: val });
    }

    /**
     * Set the `deprecated` of the schema.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.3}
     *
     * @param this - this instance
     * @param deprecated - deprecated property
     * @returns cloned schema
     */
    public deprecated(this: this, deprecated: boolean): this {
        return this.clone({ deprecated });
    }

    /**
     * Append an example literal to the schema.
     *
     * Convenience method for calling `examples([example])`.
     *
     * @param this - this instance
     * @param example - example literal
     * @returns cloned schema
     */
    public example(this: this, example: T['type']): this {
        return this.examples([example]);
    }

    /**
     * Append multiple example values to the schema.
     *
     * While the example is type-checked, it is not asserted against the schema.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.5}
     *
     * @param this - this instance
     * @param examples - example literal array
     * @returns cloned schema
     */
    public examples(this: this, examples: T['type'][]): this {
        return this.clone({
            [examplesSym]: [...this.#examples, ...examples],
        });
    }

    /**
     * Set the schema as `readOnly`.
     *
     * Has no impact on validation (or typings), but as a hint that attempts to modify may be rejected/ignored.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.4}
     *
     * @param this - this instance
     * @param readOnly - read only property
     * @returns cloned schema
     */
    public readOnly(this: this, readOnly: boolean): this {
        return this.clone({ readOnly });
    }

    /**
     * Set the schema as `writeOnly`.
     *
     * Has no impact on validation (or typings), but as a hint that data may be omitted when retrieved from authority.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.4}
     *
     * @param this - this instance
     * @param writeOnly - write only property
     * @returns cloned schema
     */
    public writeOnly(this: this, writeOnly: boolean): this {
        return this.clone({ writeOnly });
    }

    /**
     * Append custom metadata to schema.
     * Any JSON Schema reserved words are forbidden.
     *
     * Besides ensuring no overlap with reserved words, no content
     * validation or type inference occurs. All values are returned unaltered, regardless
     * of generation parameters.
     *
     * Useful to append metadata for implementation specific needs, such as (but not exclusive to)
     * [OpenAPI's `x-` prefix](https://swagger.io/specification/#specification-extensions) or self-implementing
     * [custom keywords](https://json-schema.org/understanding-json-schema/reference/schema.html#id6).
     *
     * This method _may_ be used for self-implement missing features
     * but such usage may be disabled at any time (via implementation).
     *
     * @param this - this instance
     * @param meta - custom metadata
     * @returns cloned schema
     * @throws when reserved word is used as keyword
     */
    public metadata<K extends string, V>(
        this: this,
        ...meta: (K & ReservedWords extends never ? unknown[] : [never]) & ([K, V] | [Record<K, V>])
    ): this {
        const metadata = { ...this.#metadata };
        if (meta.length === 1) {
            for (const key of Object.keys(meta[0])) {
                if (reservedWords.has(key)) {
                    throw new Error(`Illegal use of reserved word: ${key}`);
                }
            }
            Object.assign(metadata, meta[0]);
        } else {
            const key = meta[0];
            if (reservedWords.has(key)) {
                throw new Error(`Illegal use of reserved word: ${key}`);
            }
            metadata[key] = meta[1];
        }
        return this.clone({
            [metadataSym]: metadata,
        });
    }

    /**
     * Reference schema via `$ref`.
     * Path to ref must be provided, and is not validated.
     *
     * Any "edits" to the resulting object are merged into the `$ref` object.
     *
     * The `$ref` object is expected to be the value of the schema called with `toJSON()`.
     *
     * Note that this syntax is valid in OpenApi 3.0, but behavior is _generally_
     * expected to ignore any sibling properties.
     * Actual implementation is up to user (many `$ref` parsers will merge objects).
     *
     * @see {@link https://json-schema.org/understanding-json-schema/structuring.html#ref}
     *
     * @param this - this instance
     * @param path - $ref path property
     * @returns cloned schema
     */
    public ref(this: this, path: string): this {
        return this.clone({
            [refSym]: {
                path,
                schema: this,
            },
        });
    }

    /**
     * Explicitly cast schema.
     *
     * Use with caution as any types are not enforced and
     * no more type-specific extensions are possible.
     *
     * Convenience method for tacking on custom symbols or attributes
     * that vary by implementation/usage.
     *
     * @returns typed schema
     */
    // eslint-disable-next-line @typescript-eslint/prefer-return-this-type
    public cast<NewT extends T['type']>(): AbstractSchema<SchemaGenerics<NewT>> {
        return this satisfies AbstractSchema<SchemaGenerics<NewT>>;
    }

    /**
     * Append an `allOf` restriction on schema.
     *
     * @see {@link https://json-schema.org/understanding-json-schema/reference/combining.html#allof}
     *
     * @param schema - all of schema must be valid
     * @returns cloned schema
     */
    protected allOf(schema: never): unknown {
        return this.clone({
            [allOfSym]: [...this.#allOf, schema],
        });
    }

    /**
     * Define a `anyOf` restriction on schema.
     *
     * @see {@link https://json-schema.org/understanding-json-schema/reference/combining.html#anyof}
     *
     * @param schemas - any of schema must be valid
     * @returns cloned schema
     */
    protected anyOf(schemas: never[]): unknown {
        return this.clone({
            [anyOfSym]: [...this.#anyOf, schemas],
        });
    }

    /**
     * Apply conditional schemas.
     *
     * @see {@link https://json-schema.org/understanding-json-schema/reference/conditionals.html#if-then-else}
     *
     * @param schema - "if" schema property
     * @param conditionals - "then" + "else" schemas, at least one is required.
     * @returns cloned schema
     */
    protected if(schema: never, conditionals: ConditionalResult<never>): unknown {
        return this.clone({
            [conditionalsSym]: [
                ...this.#conditionals,
                {
                    if: schema,
                    // eslint-disable-next-line unicorn/no-thenable, @typescript-eslint/no-unnecessary-condition
                    then: conditionals.then ?? null,
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    else: conditionals.else ?? null,
                },
            ],
        });
    }

    /**
     * A schema definition that would render the schema invalid.
     *
     * Does not alter types, as the closest typescript equivalent `Exclude`
     * doesn't actually ensure excluded types.
     *
     * ```ts
     * type NotReallyExcluded = Exclude<{ abc: string; efg?: number }, { abc: 123 }>;
     * const shouldBeInvalid: NotReallyExcluded = { abc: 123 };
     * ```
     *
     * Schemas that support `nullable()` may exclude `null` if appropriate.
     *
     * @see {@link https://json-schema.org/understanding-json-schema/reference/combining.html#not}
     *
     * @param schema - schema to validate against
     * @returns cloned schema
     */
    protected not(schema: never): unknown {
        return this.clone({
            [notSym]: [...this.#nots, schema],
        });
    }

    /**
     * Set schema as `nullable`.
     * Allowing `type=null` as well as existing type.
     *
     * @returns cloned schema
     */
    protected nullable(): unknown {
        return this.clone({
            [nullableSym]: true,
        });
    }

    /**
     * Define a `oneOf` restriction on schema.
     *
     * @see {@link https://json-schema.org/understanding-json-schema/reference/combining.html#oneof}
     *
     * @param schemas - one of schema must be valid
     * @returns cloned schema
     */
    protected oneOf(schemas: never[]): unknown {
        return this.clone({
            [oneOfSym]: [...this.#oneOf, schemas],
        });
    }

    /**
     * Instance method to call static method (using constructor for inheritance).
     *
     * @param this - this instance
     * @param params - serialization params
     * @returns JSON Schema
     */
    protected getChildSchema<T2>(
        this: AbstractSchema<SchemaGenerics<T2>>,
        params: SerializationParams
    ): JsonSchema<T2> {
        return AbstractSchema.#getChildSchema.bind(this.constructor)(this, params);
    }

    /**
     * Returns default constructor params for child class.
     *
     * Child classes SHOULD implement, and MUST extend response from `super.getCloneParams()`.
     * If no extra parameters are used, do not need to implement.
     *
     * @returns schema params based on instance
     */
    protected getCloneParams(): Required<SchemaParams<T['type']>> & T['params'] {
        return {
            default: this.#default,
            deprecated: this.#deprecated,
            description: this.#description,
            readOnly: this.#readOnly,
            title: this.#title,
            writeOnly: this.#writeOnly,
            [allOfSym]: [...this.#allOf],
            [anyOfSym]: [...this.#anyOf],
            [conditionalsSym]: [...this.#conditionals],
            [examplesSym]: [...this.#examples],
            [metadataSym]: { ...this.#metadata },
            [notSym]: [...this.#nots],
            [nullableSym]: this.#nullable,
            [oneOfSym]: [...this.#oneOf],
            [refSym]: this.#ref,
        };
    }

    /**
     * Creates a new instance of this schema class,
     * with parameters to set attributes to same as this instance.
     *
     * Override existing values via the `overrideParams`.
     *
     * Child classes MUST NOT override.
     *
     * @param overrideParams - override constructor params
     * @returns schema params
     */
    protected clone(overrideParams: Partial<T['params']>): this {
        return (this.constructor as typeof AbstractSchema).create({
            ...this.getCloneParams(),
            ...overrideParams,
        }) as this;
    }

    /**
     * Generate JSON Schema for this data type.
     *
     * Child classes SHOULD override and extend value of `super.toSchema()`.
     * If no extra schema data is added, do not need to implement.
     *
     * @param params - serialization params
     * @returns JSON Schema
     */
    protected toSchema(params: SerializationParams): JsonSchema<SchemaType<this>> {
        const base: JsonSchema<SchemaType<this>> = { ...this.#metadata };

        const nullable = this.#getNullable(params);
        const schemaType = this.#getSchemaType(params);

        if (schemaType) {
            if (params.composition && !this.#ref) {
                if (params.composition.type !== schemaType) {
                    if (nullable) {
                        if (params.openApi30) {
                            base.type = schemaType;
                            base.nullable = true;
                        } else {
                            base.type = [schemaType, 'null'];
                        }
                    } else {
                        base.type = schemaType;
                    }
                } else if (params.composition.nullable && !nullable) {
                    base.type = schemaType;
                }
            } else if (nullable) {
                if (params.openApi30) {
                    base.type = schemaType;
                    base.nullable = true;
                } else {
                    base.type = [schemaType, 'null'];
                }
            } else {
                base.type = schemaType;
            }
        }

        if (this.#title) {
            base.title = this.#title;
        }

        if (this.#default !== undefined) {
            base.default = this.#default;
        }

        if (this.#description) {
            base.description = this.#description;
        }

        if (this.#examples.length > 0) {
            if (params.openApi30) {
                [base.example] = this.#examples;
            } else {
                base.examples = this.#examples;
            }
        }

        if (this.#deprecated) {
            base.deprecated = this.#deprecated;
        }

        if (this.#readOnly) {
            base.readOnly = this.#readOnly;
        }

        if (this.#writeOnly) {
            base.writeOnly = this.#writeOnly;
        }

        const compositionParams = {
            ...params,
            composition: {
                type: schemaType,
                nullable,
            },
        };

        if (this.#allOf.length > 0) {
            base.allOf = this.#allOf.map(schema => schema.getChildSchema(compositionParams));
        }

        const [conditional, ...conditionals] = params.openApi30
            ? this.#conditionals.flatMap(condition => {
                  const conditions: JsonSchema<T['type']>[] = [];
                  const ifSchema = condition.if.getChildSchema(compositionParams);
                  // https://json-schema.org/understanding-json-schema/reference/conditionals.html#implication
                  if (condition.then) {
                      conditions.push({
                          anyOf: [
                              { not: ifSchema },
                              condition.then.getChildSchema(compositionParams),
                          ],
                      });
                  }
                  if (condition.else) {
                      conditions.push({
                          anyOf: [ifSchema, condition.else.getChildSchema(compositionParams)],
                      });
                  }
                  return conditions;
              })
            : this.#conditionals.map(condition => {
                  const mergeSchema: JsonSchema<T['type']> = {
                      if: condition.if.getChildSchema(compositionParams),
                  };
                  if (condition.then) {
                      // This `then` keyword can make an object appear like a "Promise".
                      // So always wrap in `allOf` rather than top level to prevent accidental `await`.
                      // eslint-disable-next-line unicorn/no-thenable
                      mergeSchema.then = condition.then.getChildSchema(compositionParams);
                  }
                  if (condition.else) {
                      mergeSchema.else = condition.else.getChildSchema(compositionParams);
                  }
                  return mergeSchema;
              });
        if (conditional?.then) {
            conditionals.unshift(conditional);
        } else {
            Object.assign(base, conditional);
        }
        mergeAllOf(base, conditionals);

        const [not, ...nots] = this.#nots.map(schema => ({
            not: schema.getChildSchema(compositionParams),
        }));
        Object.assign(base, not);
        mergeAllOf(base, nots);

        const [anyOf, ...anyOfs] = this.#anyOf.map(schemas =>
            schemas.map(schema => schema.getChildSchema(compositionParams))
        );
        if (anyOf) {
            if (base.anyOf) {
                anyOfs.unshift(anyOf);
            } else {
                base.anyOf = anyOf;
            }
            mergeAllOf(
                base,
                anyOfs.map(o => ({ anyOf: o }))
            );
        }

        const [oneOf, ...oneOfs] = this.#oneOf.map(schemas =>
            schemas.map(schema => schema.getChildSchema(compositionParams))
        );
        if (oneOf) {
            base.oneOf = oneOf;
            if (oneOfs.length > 0) {
                mergeAllOf(
                    base,
                    oneOfs.map(o => ({ oneOf: o }))
                );
            }
        }

        return base;
    }

    /**
     * Method to get JSON schema of a internal property (e.g. array item).
     *
     * Child classes MUST NOT override.
     *
     * @param schema - juniper schema
     * @param params - serialization params (stripped of composition context)
     * @param params.openApi30 - open api 3.0 compliant
     * @returns JSON Schema
     */
    protected static getSchema<T2>(
        schema: AbstractSchema<SchemaGenerics<T2>>,
        { openApi30 }: SerializationParams
    ): JsonSchema<T2> {
        return AbstractSchema.#getChildSchema.bind(this.constructor)(schema, {
            openApi30,
        });
    }

    /**
     * Method to get JSON schema of a child property (e.g. schema within `if`).
     *
     * Child classes MUST NOT override.
     *
     * @param schema - juniper schema
     * @param params - serialization params
     * @returns JSON Schema
     */
    static #getChildSchema<T2>(
        schema: AbstractSchema<SchemaGenerics<T2>>,
        params: SerializationParams
    ): JsonSchema<T2> {
        const baseSchema = schema.toSchema(params);
        if (schema.#ref) {
            const refSchema = schema.#ref.schema.toSchema({
                openApi30: params.openApi30,
            });
            return mergeRef<T2>({
                baseSchema,
                refSchema,
                defaultValues: this.getDefaultValues(params),
                refPath: schema.#ref.path,
            });
        }
        return baseSchema;
    }

    /**
     * If a schema is declared nullable, but conditions require non-null,
     * do not flag it as nullable (easier to read + optimization).
     *
     * @param params - serialization params
     * @returns nullable
     */
    #getNullable(params: SerializationParams): boolean {
        if (params.composition?.type && !params.composition.nullable) {
            return this.#ref
                ? this.#ref.schema.#getNullable({
                      openApi30: params.openApi30,
                  })
                : false;
        }
        return (
            this.#nullable &&
            this.#conditionals.every(predicate => {
                if (predicate.if.#getNullable(params)) {
                    return predicate.then ? predicate.then.#getNullable(params) : true;
                }
                return predicate.else ? predicate.else.#getNullable(params) : true;
            }) &&
            this.#nots.every(not => !not.#getNullable(params)) &&
            this.#allOf.every(allOf => allOf.#getNullable(params)) &&
            this.#anyOf.every(anyOf => anyOf.some(any => any.#getNullable(params))) &&
            this.#oneOf.every(oneOf => oneOf.filter(one => one.#getNullable(params)).length === 1)
        );
    }

    /**
     * Check if schema is "optimizable" for integers.
     * Ignores non-numeric schemas (always false).
     *
     * Returns true when some compositional part of the schema (e.g. every schema of an anyOf)
     * is an integer thus forcing the entire schema to an integer implicitly.
     *
     * @param params - serialization params
     * @returns is optimizable
     */
    #canOptimizeInteger(params: SerializationParams): boolean {
        return (
            params.composition?.type === 'integer' ||
            this.#conditionals.some(
                predicate =>
                    (predicate.if.#getSchemaType(params) === 'integer' ||
                        (predicate.then
                            ? predicate.then.#getSchemaType(params) === 'integer'
                            : false)) &&
                    (predicate.else ? predicate.else.#getSchemaType(params) === 'integer' : false)
            ) ||
            this.#allOf.some(allOf => allOf.#getSchemaType(params) === 'integer') ||
            this.#anyOf.some(
                anyOf =>
                    anyOf.length > 0 && anyOf.every(any => any.#getSchemaType(params) === 'integer')
            ) ||
            this.#oneOf.some(
                oneOf =>
                    oneOf.length > 0 && oneOf.every(one => one.#getSchemaType(params) === 'integer')
            )
        );
    }

    /**
     * Similar to `__getNullable`, if every condition of a `number` is an `integer`
     * then must be an `integer`.
     *
     * `integer` type may come with extra restrictions, so be conservative in type updating.
     *
     * Other types will be returned unchanged.
     *
     * @param params - serialization params
     * @returns schema type
     */
    #getSchemaType(params: SerializationParams): string | null {
        const { schemaType } = this;

        if (
            (schemaType === 'integer' || schemaType === 'number') &&
            this.#canOptimizeInteger(params) &&
            // Ensure $ref (if exists) is also integer, or else this optimization is worse.
            (!this.#ref ||
                this.#ref.schema.#getSchemaType({
                    openApi30: params.openApi30,
                }) !== 'number')
        ) {
            return 'integer';
        }

        return schemaType ?? null;
    }
}
