import type { SchemaGenerics, SchemaParams, SerializationParams } from '../lib/schema.js';
import type { JsonSchema, SchemaType } from '../lib/types.js';
import { AbstractSchema } from '../lib/schema.js';

/**
 * Schema for defining a "never" schema.
 *
 * Usage should be carefully considered, as often there are alternatives that better
 * describe a schema.
 *
 * Convenient for some cases where "content" is impossible, like
 * an empty array `never[]`.
 */
export class NeverSchema extends AbstractSchema<SchemaGenerics<never>> {
    /**
     * Not applicable.
     */
    declare public allOf: never;

    /**
     * Not applicable.
     */
    declare public anyOf: never;

    /**
     * Not applicable.
     */
    declare public if: never;

    /**
     * Used internally
     */
    declare public not: never;

    /**
     * Not applicable.
     */
    declare public nullable: never;

    /**
     * Not applicable.
     */
    declare public oneOf: never;

    /**
     * Create a new instance of NullSchema.
     *
     * @param [options] - optional
     * @param [options.title] - Add title to schema
     * @param [options.description] - Add description to schema
     * @param [options.deprecated] - flag schema as deprecated
     * @param [options.readOnly] - value should not be modified
     * @param [options.writeOnly] - value should be hidden
     * @returns impossible schema
     */
    public static override create(this: void, options?: SchemaParams<never>): NeverSchema {
        return new NeverSchema(options);
    }

    /**
     * @override
     */
    protected override toSchema(params: SerializationParams): JsonSchema<SchemaType<this>> {
        const base = super.toSchema(params);

        base.not = {};

        return base;
    }
}
