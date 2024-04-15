import type { AbstractSchema, ConditionalResult, SchemaGenerics } from '../lib/schema.js';
import type { ConditionalNullable, IsNever, Schema, SchemaType, ToBaseType } from '../lib/types.js';
import {
    type ArrayParams,
    ArraySchema,
    ArraySchemaOverride,
    type ArrayType,
    prefixItemsSym,
} from './array.js';

interface TupleParams<T, P extends any[], C extends P[number], M, N extends boolean>
    extends Omit<ArrayParams<T, P, C, M, N>, 'items' | 'maxItems' | 'minItems'> {}

type AnyTupleSchema = TupleSchema<never, any[], any, unknown, boolean>;

/**
 * Schema for defining strict `Tuple` types.
 *
 * "Strict" is [defined by AJV](https://ajv.js.org/options.html#stricttuples)
 * and refers to a Tuple with no extra items and a fixed length.
 *
 * Convenience wrapper around ArraySchema.
 *
 * __Tuples are not supported in OpenAPI 3.0__
 *
 * If generating a schema for OpenApi 3.0, the result will just be an array
 * where any item can be in any location.
 */
export class TupleSchema<
    T = never,
    P extends any[] = [],
    // Contains
    C extends P[number] = never,
    // Merged
    M = unknown,
    // Nullable
    N extends boolean = false,
> extends ArraySchemaOverride<T, P, C, M, N> {
    /**
     * Always `false`
     */
    public declare items: never;

    /**
     * Controlled by `prefixItems` size.
     */
    public declare maxItems: never;
    public declare minItems: never;

    public declare allOf: <S extends ArraySchema<any, any[], any, unknown, boolean>>(
        this: AnyTupleSchema,
        schema: S
    ) => TupleSchema<
        T,
        P,
        C,
        M & NonNullable<SchemaType<S>>,
        null extends SchemaType<S> ? N : boolean
    >;

    public declare anyOf: <S extends ArraySchema<any, any[], any, unknown, boolean>>(
        this: AnyTupleSchema,
        schemas: S[]
    ) => TupleSchema<
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
        Then extends Schema<unknown[] | null> = TupleSchema,
        Else extends Schema<unknown[] | null> = TupleSchema,
    >(
        this: AnyTupleSchema,
        schema: ArraySchema<IfT, IfP, IfC, IfM, IfN>,
        conditionals: ConditionalResult<Then, Else>
    ) => TupleSchema<
        T,
        P,
        C,
        M &
            (
                | NonNullable<SchemaType<Else>>
                | (ArrayType<IfT, IfP, IfM, false> & NonNullable<SchemaType<Then>>)
            ),
        ConditionalNullable<
            N,
            IfN,
            null extends SchemaType<Then> ? true : boolean,
            null extends SchemaType<Else> ? true : boolean
        >
    >;

    public declare not: <NotN extends boolean>(
        this: AnyTupleSchema,
        schema:
            | ArraySchema<any, any[], any, unknown, NotN>
            | TupleSchema<any, any[], any, unknown, NotN>
    ) => NotN extends true ? TupleSchema<T, P, C, unknown, boolean> : this;

    public declare nullable: (
        this: AnyTupleSchema
    ) => TupleSchema<T, P, C, M, boolean extends N ? boolean : true>;

    public declare oneOf: <S extends ArraySchema<any, any[], any, unknown, boolean>>(
        this: AnyTupleSchema,
        schemas: S[]
    ) => TupleSchema<
        T,
        P,
        C,
        M & NonNullable<SchemaType<S>>,
        null extends SchemaType<S> ? N : boolean
    >;

    /**
     * @override
     */
    public declare contains: <C2 extends ToBaseType<P[number]>>(
        this: AnyTupleSchema,
        items: AbstractSchema<SchemaGenerics<C2>>,
        invalid: IsNever<C> extends true ? void : never
    ) => TupleSchema<T, P, C2, M, N>;

    /**
     * @override
     */
    public declare prefixItem: <NewP>(
        this: AnyTupleSchema,
        schema: AbstractSchema<SchemaGenerics<NewP>>
    ) => TupleSchema<T, [...P, NewP], C, M, N>;

    /**
     * @override
     */
    public declare prependPrefixItem: <NewP>(
        this: AnyTupleSchema,
        schema: AbstractSchema<SchemaGenerics<NewP>>
    ) => TupleSchema<T, [NewP, ...P], C, M, N>;

    /**
     * @override
     */
    public constructor(options: TupleParams<T, P, C, M, N> = {}) {
        const prefixItemsSize = options[prefixItemsSym]?.length ?? 0;
        super({
            ...options,
            items: ArraySchema.falseItems,
            maxItems: prefixItemsSize,
            minItems: prefixItemsSize,
        });
    }

    /**
     * Create a new instance of TupleSchema.
     *
     * @param [options] - options or schema
     * @param [options.uniqueItems] - each item is unique
     * @param [options.minContains] - minimum instances of contained schema (inclusive)
     * @param [options.maxContains] - maximum instances of contained schema (inclusive)
     * @param [options.title] - Add title to schema
     * @param [options.description] - Add description to schema
     * @param [options.deprecated] - flag schema as deprecated
     * @param [options.readOnly] - value should not be modified
     * @param [options.writeOnly] - value should be hidden
     * @returns cloned tuple schema
     */
    public static override create(
        this: void,
        options?: TupleParams<never, [], never, unknown, false>
    ): TupleSchema {
        return new TupleSchema(options);
    }
}
