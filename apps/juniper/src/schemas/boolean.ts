import {
    AbstractSchema,
    type SchemaGenerics,
    type SchemaParams,
} from '../lib/schema.js';
import type { Nullable } from '../lib/types.js';

type AnyBooleanSchema = BooleanSchema<boolean>;

/**
 * Schema for defining boolean type.
 */
export class BooleanSchema<
    // Nullable
    N extends boolean = false,
> extends AbstractSchema<SchemaGenerics<Nullable<boolean, N>>> {
    protected override readonly schemaType = 'boolean';

    /**
     * Not enough possible states.
     */
    public declare anyOf: never;

    /**
     * Not enough possible states.
     */
    public declare allOf: never;

    /**
     * Not enough possible states.
     */
    public declare if: never;

    /**
     * Not enough possible states.
     */
    public declare oneOf: never;

    /**
     * Not enough possible states.
     */
    public declare not: never;

    public declare nullable: (this: AnyBooleanSchema) => BooleanSchema<true>;

    /**
     * Create a new instance of BooleanSchema.
     *
     * @param {void} [this] - void
     * @param {object} [options] - options
     * @param {string} [options.title] - Add title to schema
     * @param {string} [options.description] - Add description to schema
     * @param {boolean} [options.deprecated] - flag schema as deprecated
     * @param {boolean} [options.readOnly] - value should not be modified
     * @param {boolean} [options.writeOnly] - value should be hidden
     * @returns {BooleanSchema} boolean schema
     */
    public static override create(
        this: void,
        options?: SchemaParams<boolean>
    ): BooleanSchema {
        return new BooleanSchema(options);
    }
}
