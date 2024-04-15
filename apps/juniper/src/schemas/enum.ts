import {
    AbstractSchema,
    type SchemaGenerics,
    type SchemaParams,
    type SerializationParams,
} from '../lib/schema.js';
import type { JsonSchema, SchemaType } from '../lib/types.js';

interface EnumParams<T> extends SchemaParams<T> {
    enum?: readonly T[];
}

interface EnumGenerics<T> extends SchemaGenerics<T> {
    params: EnumParams<T>;
}

/**
 * Schema for defining enum types.
 *
 * To ensure best type inference, it is recommended to pass parameters `as const`.
 *
 * @example
 * const schema = EnumSchema.create({ enums: [1, 2] as const }).enum(3 as const);
 */
export class EnumSchema<T = never> extends AbstractSchema<EnumGenerics<T>> {
    readonly #enum: readonly T[];

    /**
     * Enums aren't conditional.
     */
    public declare allOf: never;

    /**
     * Enums aren't conditional.
     */
    public declare anyOf: never;

    /**
     * Enums aren't conditional.
     */
    public declare if: never;

    /**
     * Enums aren't conditional.
     */
    public declare not: never;

    /**
     * Not applicable.
     */
    public declare nullable: never;

    /**
     * Enums aren't conditional.
     */
    public declare oneOf: never;

    /**
     * @override
     */
    public constructor(options: EnumParams<T> = {}) {
        super(options);
        this.#enum = options.enum ?? [];
    }

    /**
     * Create a new instance of EnumSchema.
     *
     * @param [options] - optional
     * @param [options.enums] - initial enum values.
     * @param [options.title] - Add title to schema
     * @param [options.description] - Add description to schema
     * @param [options.deprecated] - flag schema as deprecated
     * @param [options.readOnly] - value should not be modified
     * @param [options.writeOnly] - value should be hidden
     * @returns new enum schema
     */
    public static override create<T = never>(this: void, options?: EnumParams<T>): EnumSchema<T> {
        return new EnumSchema(options);
    }

    /**
     * Append a possible `enum` value to the schema.
     *
     * Convenience method for calling `enums([val])`.
     *
     * @param this - this instance
     * @param val - enum literal
     * @returns cloned schema
     */
    public enum<EVal>(this: this, val: EVal): EnumSchema<EVal | T> {
        return this.enums([val]);
    }

    /**
     * Append multiple possible `enum` values to the schema.
     *
     * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.1.2}
     *
     * @param this - this instance
     * @param enums - enum literal array
     * @returns cloned schema
     */
    public enums<EVal>(this: this, enums: readonly EVal[]): EnumSchema<EVal | T> {
        return this.clone({
            enum: [...this.#enum, ...enums] as T[],
        }) as EnumSchema<EVal | T>;
    }

    /**
     * @override
     */
    protected override getCloneParams(): Required<EnumParams<T>> {
        return {
            ...super.getCloneParams(),
            enum: [...this.#enum],
        };
    }

    /**
     * @override
     */
    protected override toSchema(params: SerializationParams): JsonSchema<SchemaType<this>> {
        const base = super.toSchema(params);

        const enums = [...new Set(this.#enum)];

        if (enums.length === 1 && !params.openApi30) {
            [base.const] = enums;
        } else {
            base.enum = enums;
        }

        return base;
    }
}
