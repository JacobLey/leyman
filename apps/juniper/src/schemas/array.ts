import { maxInt } from '../lib/constants.js';
import {
    AbstractSchema,
    type ConditionalResult,
    type SchemaGenerics,
    type SchemaParams,
    type SerializationParams,
} from '../lib/schema.js';
import type {
    ConditionalNullable,
    IsAny,
    IsNever,
    JsonSchema,
    Nullable,
    Schema,
    SchemaType,
    ToBaseType,
} from '../lib/types.js';
import { NeverSchema } from './never.js';

const containsSym = Symbol('contains');
export const prefixItemsSym = Symbol('prefixItems');

export type ArrayType<T, P extends any[], M, N extends boolean> = Nullable<
    M &
        (IsAny<T> extends true
            ? [...P, ...unknown[]]
            : IsNever<T> extends true
              ? P
              : [...P, ...T[]]),
    N
>;

export interface ArrayParams<
    T,
    P extends any[],
    C extends P[number] | T,
    M,
    N extends boolean,
> extends SchemaParams<ArrayType<T, P, M, N>> {
    items?: AbstractSchema<SchemaGenerics<T>> | null;
    maxContains?: number;
    maxItems?: number;
    minContains?: number;
    minItems?: number;
    uniqueItems?: boolean;
    [containsSym]?: AbstractSchema<SchemaGenerics<C>> | null;
    [prefixItemsSym]?: AbstractSchema<SchemaGenerics<P[number]>>[];
}

interface ArrayGenerics<
    T,
    P extends any[],
    C extends P[number] | T,
    M,
    N extends boolean,
> extends SchemaGenerics<ArrayType<T, P, M, N>> {
    params: ArrayParams<T, P, C, M, N>;
}

export type AnyArraySchema = ArraySchema<any, any[], any, unknown, boolean>;

/**
 * Schema for defining `array` types.
 *
 * Note that some implementations of `uniqueItems=true` may convert to a `Set`
 * but that is not reflected here.
 *
 * Tuples are supported via `prefixItems`.
 *
 * `items` may only be set once.
 * Similarly `contains` may only be set once, after `items`.
 *
 * __Tuples and Contains are not supported in OpenAPI 3.0__
 *
 * If generating a schema for OpenApi 3.0, the result will just be an array
 * where any item can be in any location.
 * `contains` will be ignored altogether.
 */
export class ArraySchema<
    T = any,
    // Prefix
    P extends any[] = [],
    // Contains
    C extends P[number] | T = never,
    // Merged
    M = unknown,
    // Nullable,
    N extends boolean = false,
> extends AbstractSchema<ArrayGenerics<T, P, C, M, N>> {
    /**
     * Specific instance of `NeverSchema`.
     *
     * Pass it to `items` to result in `items: false` rather then `items: { not: {} }`.
     * Required for a "strict" tuple.
     */
    public static readonly falseItems = new NeverSchema();

    readonly #contains: AbstractSchema<SchemaGenerics<C>> | null;
    readonly #items: AbstractSchema<SchemaGenerics<T>> | null;
    readonly #maxContains: number;
    readonly #maxItems: number;
    readonly #minContains: number;
    readonly #minItems: number;
    readonly #prefixItems: AbstractSchema<SchemaGenerics<P[number]>>[];
    readonly #uniqueItems: boolean;

    protected override readonly schemaType = 'array';

    public declare allOf: <
        S extends ArraySchema<any, any[], any, unknown, boolean>,
    >(
        this: AnyArraySchema,
        schema: S
    ) => ArraySchema<
        T,
        P,
        C,
        M & NonNullable<SchemaType<S>>,
        null extends SchemaType<S> ? N : boolean
    >;

    public declare anyOf: <
        S extends ArraySchema<any, any[], any, unknown, boolean>,
    >(
        this: AnyArraySchema,
        schemas: S[]
    ) => ArraySchema<
        T,
        P,
        C,
        M & NonNullable<SchemaType<S>>,
        null extends SchemaType<S> ? N : boolean
    >;

    public declare if: <
        IfT,
        IfP extends any[],
        IfC extends IfP[number] | IfT,
        IfM,
        IfN extends boolean,
        Then extends Schema<unknown[] | null> = ArraySchema,
        Else extends Schema<unknown[] | null> = ArraySchema,
    >(
        this: AnyArraySchema,
        schema: ArraySchema<IfT, IfP, IfC, IfM, IfN>,
        conditionals: ConditionalResult<Then, Else>
    ) => ArraySchema<
        T,
        P,
        C,
        M &
            (
                | NonNullable<SchemaType<Else>>
                | (ArrayType<IfT, IfP, IfM, false> &
                      NonNullable<SchemaType<Then>>)
            ),
        ConditionalNullable<
            N,
            IfN,
            null extends SchemaType<Then> ? true : boolean,
            null extends SchemaType<Else> ? true : boolean
        >
    >;

    public declare not: <NotN extends boolean>(
        this: AnyArraySchema,
        schema: ArraySchema<any, any[], any, unknown, NotN>
    ) => NotN extends true ? ArraySchema<T, P, C, unknown, boolean> : this;

    public declare nullable: (
        this: AnyArraySchema
    ) => ArraySchema<T, P, C, unknown, boolean extends N ? boolean : true>;

    public declare oneOf: <
        S extends ArraySchema<any, any[], any, unknown, boolean>,
    >(
        this: AnyArraySchema,
        schemas: S[]
    ) => ArraySchema<
        T,
        P,
        C,
        M & NonNullable<SchemaType<S>>,
        null extends SchemaType<S> ? N : boolean
    >;

    /**
     * @override
     */
    public constructor(
        items:
            | AbstractSchema<SchemaGenerics<T>>
            | ArrayParams<T, P, C, M, N> = {}
    ) {
        const options = items instanceof AbstractSchema ? { items } : items;
        super(options);
        this.#items = options.items ?? null;
        this.#maxContains = options.maxContains ?? Number.POSITIVE_INFINITY;
        this.#maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
        this.#minContains = options.minContains ?? 1;
        this.#minItems = options.minItems ?? 0;
        this.#uniqueItems = options.uniqueItems ?? false;
        this.#contains = options[containsSym] ?? null;
        this.#prefixItems = options[prefixItemsSym] ?? [];
    }

    /**
     * Create a new instance of ArraySchema.
     *
     * Conforming to other Schema constructors, all input is optional and can be appended via
     * methods.
     * However the `items` schema may be passed as the only input.
     * If it is not passed, the `items()` method may be used to type the array.
     *
     * @example
     * // The following 3 constructors will create identical types/schemas: `number[]`.
     * const arr = ArraySchema().items(NumberSchema());
     * const arr2 = ArraySchema({ items: NumberSchema() });
     * const arr3 = ArraySchema(NumberSchema());
     *
     * @param {void} [this] - this
     * @param {object} [options] - options or schema
     * @param {Schema} [options.items] - array items
     * @param {number} [options.minItems] - minimum items in array (inclusive)
     * @param {number} [options.maxItems] - maximum items of array (inclusive)
     * @param {number} [options.minContains] - minimum instances of contained schema (inclusive)
     * @param {number} [options.maxContains] - maximum instances of contained schema (inclusive)
     * @param {boolean} [options.uniqueItems] - each item is unique
     * @param {string} [options.title] - Add title to schema
     * @param {string} [options.description] - Add description to schema
     * @param {boolean} [options.deprecated] - flag schema as deprecated
     * @param {boolean} [options.readOnly] - value should not be modified
     * @param {boolean} [options.writeOnly] - value should be hidden
     * @returns {ArraySchema} array schema
     */
    public static override create<T2 = any>(
        this: void,
        options?:
            | AbstractSchema<SchemaGenerics<T2>>
            | ArrayParams<T2, [], never, unknown, false>
    ): ArraySchema<T2> {
        return new ArraySchema(options);
    }

    /**
     * Set the `items` of the array.
     *
     * Can only be set once.
     *
     * @see {@link https://json-schema.org/understanding-json-schema/reference/array.html#items}
     *
     * @param {this} this - this instance
     * @param {Schema} items - items schema
     * @returns {ArraySchema} - newly typed array schema
     */
    public items<T2>(
        this: this,
        items: AbstractSchema<SchemaGenerics<T2>>,
        invalid: IsAny<T> extends true ? void : never
    ): ArraySchema<T2, P, C, unknown, N>;
    /**
     * @inheritdoc
     */
    public items<T2>(
        this: this,
        items: AbstractSchema<SchemaGenerics<T2>>
    ): ArraySchema<T2, P, C, unknown, N> {
        return (this as unknown as ArraySchema<T2, P, C, unknown, N>).clone({
            items,
        });
    }

    /**
     * Set the `maxItems` of the array.
     * Set to `Infinity` to effectively clear restriction.
     *
     * Does not alter typings.
     * Overwrites existing restriction.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.1}
     *
     * @param {this} this - this instance
     * @param {number} maxItems - max items
     * @returns {ArraySchema} schema
     */
    public maxItems(this: this, maxItems: number): this {
        return this.clone({ maxItems });
    }

    /**
     * Set the `minItems` of the array.
     * Set to `0` to effectively clear restriction.
     *
     * Does not alter typings.
     * Overwrites existing restriction.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.2}
     *
     * @param {this} this - this instance
     * @param {number} minItems - min items
     * @returns {ArraySchema} schema
     */
    public minItems(this: this, minItems: number): this {
        return this.clone({ minItems });
    }

    /**
     * Set the `uniqueItems` of the array.
     * Set to `false` to effectively clear restriction.
     *
     * Does not alter typings.
     * Overwrites existing restriction.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.3}
     *
     * @param {this} this - this instance
     * @param {boolean} uniqueItems - unique items
     * @returns {ArraySchema} schema
     */
    public uniqueItems(this: this, uniqueItems: boolean): this {
        return this.clone({ uniqueItems });
    }

    /**
     * Set the `contains` of the array.
     *
     * Can only be set once.
     *
     * __Not supported by OpenApi 3.0__.
     *
     * @see {@link https://json-schema.org/understanding-json-schema/reference/array.html#contains}
     *
     * @param {this} this - this instance
     * @param {Schema} contains - contains schema
     * @returns {ArraySchema} - array schema
     */
    public contains<C2 extends ToBaseType<P[number] | T>>(
        this: this,
        items: AbstractSchema<SchemaGenerics<C2>>,
        invalid: IsNever<C> extends true ? void : never
    ): ArraySchema<T, P, C2, M, N>;
    /**
     * @inheritdoc
     */
    public contains<C2 extends ToBaseType<P[number] | T>>(
        this: this,
        contains: AbstractSchema<SchemaGenerics<C2>>
    ): ArraySchema<T, P, C2, M, N> {
        return (this as unknown as ArraySchema<T, P, C2, M, N>).clone({
            [containsSym]: contains,
        });
    }

    /**
     * Set the `maxContains` of the array.
     * Set to `Infinity` to effectively clear restriction.
     *
     * Does not alter typings.
     * Overwrites existing restriction.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.4}
     *
     * @param {this} this - this instance
     * @param {number} maxContains - max contains
     * @returns {ArraySchema} schema
     */
    public maxContains(this: this, maxContains: number): this {
        return this.clone({ maxContains });
    }

    /**
     * Set the `minContains` of the array.
     * Set to `1` to effectively clear restriction.
     *
     * Does not alter typings.
     * Overwrites existing restriction.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.5}
     *
     * @param {this} this - this instance
     * @param {number} minContains - min contains
     * @returns {ArraySchema} schema
     */
    public minContains(this: this, minContains: number): this {
        return this.clone({ minContains });
    }

    /**
     * Append a `prefixItem` to the tuple.
     *
     * __Not supported by OpenApi 3.0__.
     *
     * @param {this} this - this instance
     * @param {Schema} schema - schema of tuple item
     * @returns {ArraySchema} array schema
     */
    public prefixItem<NewP>(
        this: this,
        schema: AbstractSchema<SchemaGenerics<NewP>>
    ): ArraySchema<T, [...P, NewP], C, M, N> {
        return this.clone({
            [prefixItemsSym]: [...this.#prefixItems, schema],
        }) as unknown as ArraySchema<T, [...P, NewP], C, M, N>;
    }

    /**
     * Prepend a schema to `prefixItem`.
     *
     * __Not supported by OpenApi 3.0__.
     *
     * @param {this} this - this instance
     * @param {Schema} schema - schema of tuple item
     * @returns {ArraySchema} array schema
     */
    public prependPrefixItem<NewP>(
        this: this,
        schema: AbstractSchema<SchemaGenerics<NewP>>
    ): ArraySchema<T, [NewP, ...P], C, M, N> {
        return this.clone({
            [prefixItemsSym]: [schema, ...this.#prefixItems],
        }) as unknown as ArraySchema<T, [NewP, ...P], C, M, N>;
    }

    /**
     * @override
     */
    protected override getCloneParams(): Required<ArrayParams<T, P, C, M, N>> {
        return {
            ...super.getCloneParams(),
            items: this.#items,
            maxContains: this.#maxContains,
            maxItems: this.#maxItems,
            minContains: this.#minContains,
            minItems: this.#minItems,
            uniqueItems: this.#uniqueItems,
            [containsSym]: this.#contains,
            [prefixItemsSym]: [...this.#prefixItems],
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
            maxContains: maxInt,
            minContains: 1,
            maxItems: maxInt,
            minItems: 0,
            uniqueItems: false,
        };
    }

    /**
     * @override
     */
    protected override toSchema(
        this: this,
        params: SerializationParams
    ): JsonSchema<SchemaType<this>> {
        const base = super.toSchema(params);

        if (this.#maxItems < Number.POSITIVE_INFINITY) {
            base.maxItems = this.#maxItems;
        }
        if (this.#minItems > 0) {
            base.minItems = this.#minItems;
        }
        if (this.#uniqueItems) {
            base.uniqueItems = true;
        }

        let items: false | JsonSchema<unknown> | null = null;
        if (this.#items) {
            items =
                this.#items === ArraySchema.falseItems
                    ? false
                    : ArraySchema.getSchema(this.#items, params);
        }
        const prefixItems = this.#prefixItems.map(schema =>
            ArraySchema.getSchema(schema, params)
        );

        if (params.openApi30) {
            if (items !== null) {
                if (items === false) {
                    if (prefixItems.length > 0) {
                        base.items =
                            prefixItems.length === 1
                                ? prefixItems[0]
                                : { anyOf: prefixItems };
                    } else {
                        base.items = ArraySchema.getSchema(
                            ArraySchema.falseItems,
                            params
                        );
                    }
                } else {
                    const allItems = [items, ...prefixItems];
                    base.items =
                        allItems.length === 1
                            ? allItems[0]
                            : { anyOf: allItems };
                }
            }
            const minItems = this.#contains
                ? Math.max(this.#minItems, this.#minContains)
                : this.#minItems;
            if (minItems) {
                base.minItems = minItems;
            }
        } else {
            if (items !== null) {
                base.items = items;
            }
            if (this.#minItems > 0) {
                base.minItems = this.#minItems;
            }
            if (prefixItems.length > 0) {
                base.prefixItems = prefixItems;
            }
            if (this.#contains) {
                base.contains = ArraySchema.getSchema(this.#contains, params);
                if (this.#maxContains < Number.POSITIVE_INFINITY) {
                    base.maxContains = this.#maxContains;
                }
                if (this.#minContains !== 1) {
                    base.minContains = this.#minContains;
                }
            }
        }

        return base;
    }
}

/**
 * Used by TupleSchema to allow overriding declarations.
 */
export declare class IArraySchemaOverride<
    T,
    P extends any[],
    C extends P[number] | T,
    M,
    N extends boolean,
> extends ArraySchema<T, P, C, M, N> {
    public declare static create: any;

    public declare allOf: <
        S extends ArraySchema<any, any[], any, unknown, boolean>,
    >(
        this: any,
        schema: S
    ) => any;

    public declare anyOf: <
        S extends ArraySchema<any, any[], any, unknown, boolean>,
    >(
        this: any,
        schemas: S[]
    ) => any;

    public declare if: <
        IfT,
        IfP extends any[],
        IfC extends IfP[number] | IfT,
        IfM,
        IfN extends boolean,
        Then extends Schema<unknown[] | null> = ArraySchema,
        Else extends Schema<unknown[] | null> = ArraySchema,
    >(
        this: any,
        schema: ArraySchema<IfT, IfP, IfC, IfM, IfN>,
        conditionals: ConditionalResult<Then, Else>
    ) => any;

    public declare not: any;

    public declare nullable: (this: any) => any;

    public declare oneOf: <
        S extends ArraySchema<any, any[], any, unknown, boolean>,
    >(
        this: any,
        schemas: S[]
    ) => any;

    public declare contains: any;

    public declare prefixItem: any;

    public declare prependPrefixItem: any;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ArraySchemaOverride = ArraySchema as typeof IArraySchemaOverride;
