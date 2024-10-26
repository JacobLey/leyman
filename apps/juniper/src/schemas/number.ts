import {
    AbstractSchema,
    type ConditionalResult,
    type SchemaGenerics,
    type SchemaParams,
    type SerializationParams,
} from '../lib/schema.js';
import type {
    AbstractClean,
    ConditionalNullable,
    JsonSchema,
    Nullable,
    SchemaType,
} from '../lib/types.js';
import { mergeAllOf } from '../lib/utils.js';

interface LimitWithExclusive {
    value: number;
    exclusive: boolean;
}

interface NumberParams<T extends number, N extends boolean> extends SchemaParams<Nullable<T, N>> {
    type?: 'integer' | 'number';
    multipleOf?: number | number[];
    maximum?: number | LimitWithExclusive;
    minimum?: number | LimitWithExclusive;
}
interface NumberGenerics<T extends number, N extends boolean>
    extends SchemaGenerics<Nullable<T, N>> {
    params: NumberParams<T, N>;
}

type StripNumber<T extends number> = AbstractClean<number, T>;

/**
 * Greatest Common Denominator.
 *
 * @example
 * gcd(20, 35) === 5
 *
 * @param x - first value
 * @param y - second value
 * @returns Greatest Common Denominator of x and y
 */
const gcd = (x: number, y: number): number => {
    let a = x;
    let b = y;
    while (b) {
        const t = b;
        b = a % b;
        a = t;
    }
    return a;
};
/**
 * Least Common Multiple.
 *
 * @example
 * lcm(6, 8) === 24
 *
 * @param x - first value
 * @param y - second value
 * @returns Least Common Multiple of x and y
 */
const lcm = (x: number, y: number): number => (x * y) / gcd(x, y);

const numToExclusive = (value: number | LimitWithExclusive): LimitWithExclusive =>
    typeof value === 'number' ? { value, exclusive: false } : value;

type AnyNumberSchema = NumberSchema<number, boolean>;

/**
 * Schema for defining numeric types.
 *
 * Defaults to `type=number` (any valid number) but can be overwritten to `type=integer` (no fraction).
 *
 * Some `pattern` assertions are built in to help typescript, but most
 * likely end typescript result will just be `string`.
 *
 * Supports multiple `multipleOf`s.
 *
 * @template T
 * @template N
 */
export class NumberSchema<
    T extends number,
    // Nullable
    N extends boolean = false,
> extends AbstractSchema<NumberGenerics<T, N>> {
    protected declare readonly schemaType;

    readonly #maximum: LimitWithExclusive;
    readonly #minimum: LimitWithExclusive;
    readonly #multipleOfs: number[];

    public declare allOf: <S extends NumberSchema<number, boolean>>(
        this: AnyNumberSchema,
        schema: S
    ) => NumberSchema<NonNullable<SchemaType<S>> & T, null extends SchemaType<S> ? N : boolean>;

    public declare anyOf: <S extends NumberSchema<number, boolean>>(
        this: AnyNumberSchema,
        schemas: S[]
    ) => NumberSchema<NonNullable<SchemaType<S>> & T, null extends SchemaType<S> ? N : boolean>;

    public declare if: <
        IfT extends number,
        IfN extends boolean,
        ThenT extends number,
        ElseT extends number,
        ThenN extends boolean = true,
        ElseN extends boolean = true,
    >(
        this: AnyNumberSchema,
        schema: NumberSchema<IfT, IfN>,
        conditionals: ConditionalResult<NumberSchema<ThenT, ThenN>, NumberSchema<ElseT, ElseN>>
    ) => NumberSchema<
        StripNumber<T & (ElseT | (IfT & ThenT))>,
        ConditionalNullable<N, IfN, ThenN, ElseN>
    >;

    public declare not: <NotN extends boolean>(
        this: AnyNumberSchema,
        schema: NumberSchema<number, NotN>
    ) => NotN extends true ? NumberSchema<T, boolean> : this;

    public declare nullable: (
        this: AnyNumberSchema
    ) => NumberSchema<T, boolean extends N ? boolean : true>;

    public declare oneOf: <S extends NumberSchema<number, boolean>>(
        this: AnyNumberSchema,
        schemas: S[]
    ) => NumberSchema<NonNullable<SchemaType<S>> & T, null extends SchemaType<S> ? N : boolean>;

    /**
     * @override
     */
    public constructor(options: NumberParams<T, N> = {}) {
        super(options);
        this.schemaType = options.type ?? 'number';
        this.#maximum = numToExclusive(options.maximum ?? Number.POSITIVE_INFINITY);
        this.#minimum = numToExclusive(options.minimum ?? Number.NEGATIVE_INFINITY);
        this.#multipleOfs = [options.multipleOf ?? []].flat();
    }

    /**
     * Create a new instance of NumberSchema.
     *
     * @param [options] - optional
     * @param [options.minimum] - minimum value of number, defaults to inclusive.
     * @param [options.maximum] - maximum value of number, defaults to inclusive.
     * @param [options.multipleOf] - factors of number.
     * @param [options.title] - Add title to schema
     * @param [options.description] - Add description to schema
     * @param [options.deprecated] - flag schema as deprecated
     * @param [options.readOnly] - value should not be modified
     * @param [options.writeOnly] - value should be hidden
     * @returns new number schema
     */
    public static override create<T2 extends number>(
        this: void,
        options?: NumberParams<T2, false>
    ): NumberSchema<T2> {
        return new NumberSchema(options);
    }

    /**
     * Set the `type` of the number.
     *
     * Does not alter typings.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.1.1}
     *
     * @param this - this instance
     * @param type - `integer` or `number`
     * @returns cloned schema
     */
    public type(this: this, type: 'integer' | 'number'): this {
        return this.clone({ type });
    }

    /**
     * Set the `multipleOf` of the number.
     *
     * Does not alter typings.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.1}
     *
     * @param this - this instance
     * @param multipleOf - multiple of property
     * @returns cloned schema
     */
    public multipleOf(this: this, multipleOf: number): this {
        return this.clone({
            multipleOf: [...this.#multipleOfs, multipleOf],
        });
    }

    /**
     * Set the `maximum` of the number.
     * Optionally provide `exclusive` (default=false).
     * Set to `Infinity` to effectively clear restriction.
     *
     * Does not alter typings.
     * Overwrites existing restriction.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.2}
     *
     * @param this - this instance
     * @param maximum - maximum property
     * @returns cloned schema
     */
    public maximum(this: this, maximum: number | LimitWithExclusive): this {
        return this.clone({
            maximum: numToExclusive(maximum),
        });
    }

    /**
     * Set the `exclusiveMaximum` of the number.
     * Convenience method around `maximum` with `exclusive=true`.
     *
     * Does not alter typings.
     * Overwrites existing restriction.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.3}
     *
     * @param this - this instance
     * @param exclusiveMaximum - exclusive maximum property
     * @returns cloned schema
     */
    public exclusiveMaximum(this: this, exclusiveMaximum: number): this {
        return this.maximum({ value: exclusiveMaximum, exclusive: true });
    }

    /**
     * Set the `minimum` of the number.
     * Optionally provide `exclusive` (default=false).
     * Set to `-Infinity` to effectively clear restriction.
     *
     * Does not alter typings.
     * Overwrites existing restriction.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.4}
     *
     * @param this - this instance
     * @param minimum - minimum property
     * @returns cloned schema
     */
    public minimum(this: this, minimum: number | LimitWithExclusive): this {
        return this.clone({
            minimum: numToExclusive(minimum),
        });
    }

    /**
     * Set the `exclusiveMinimum` of the number.
     * Convenience method around `minimum` with `exclusive=true`.
     *
     * Does not alter typings.
     * Overwrites existing restriction.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.5}
     *
     * @param this - this instance
     * @param exclusiveMinimum - exclusive minimum property
     * @returns cloned schema
     */
    public exclusiveMinimum(this: this, exclusiveMinimum: number): this {
        return this.minimum({ value: exclusiveMinimum, exclusive: true });
    }

    /**
     * @override
     */
    protected override getCloneParams(): Required<NumberParams<T, N>> {
        return {
            ...super.getCloneParams(),
            maximum: this.#maximum,
            minimum: this.#minimum,
            multipleOf: [...this.#multipleOfs],
            type: this.schemaType,
        };
    }

    /**
     * @override
     */
    protected static override getDefaultValues(
        params: SerializationParams
    ): Record<string, unknown> {
        const superParams = super.getDefaultValues(params);
        if (params.openApi30) {
            return {
                ...superParams,
                minimum: -Number.MAX_VALUE,
                exclusiveMinimum: false,
                maximum: Number.MAX_VALUE,
                exclusiveMaximum: false,
            };
        }
        return {
            ...superParams,
            minimum: -Number.MAX_VALUE,
            exclusiveMinimum: -Number.MAX_VALUE,
            maximum: Number.MAX_VALUE,
            exclusiveMaximum: Number.MAX_VALUE,
        };
    }

    /**
     * @override
     */
    protected override toSchema(params: SerializationParams): JsonSchema<SchemaType<this>> {
        const base = super.toSchema(params);

        if (this.#minimum.value > Number.NEGATIVE_INFINITY) {
            if (this.#minimum.exclusive) {
                if (params.openApi30) {
                    base.minimum = this.#minimum.value;
                    base.exclusiveMinimum = true;
                } else {
                    base.exclusiveMinimum = this.#minimum.value;
                }
            } else {
                base.minimum = this.#minimum.value;
            }
        }

        if (this.#maximum.value < Number.POSITIVE_INFINITY) {
            if (this.#maximum.exclusive) {
                if (params.openApi30) {
                    base.maximum = this.#maximum.value;
                    base.exclusiveMaximum = true;
                } else {
                    base.exclusiveMaximum = this.#maximum.value;
                }
            } else {
                base.maximum = this.#maximum.value;
            }
        }

        const integerMultiples = this.#multipleOfs.filter(x => Number.isInteger(x));
        const floatMultiples = this.#multipleOfs.filter(x => !Number.isInteger(x));

        if (integerMultiples.length > 0) {
            // eslint-disable-next-line unicorn/no-array-reduce
            base.multipleOf = integerMultiples.reduce((acc, val) => lcm(acc, val), 1);
            mergeAllOf(
                base,
                floatMultiples.map(multipleOf => ({ multipleOf }))
            );
        } else if (floatMultiples.length > 0) {
            [base.multipleOf] = floatMultiples;
            mergeAllOf(
                base,
                floatMultiples.slice(1).map(multipleOf => ({ multipleOf }))
            );
        }

        return base;
    }
}
