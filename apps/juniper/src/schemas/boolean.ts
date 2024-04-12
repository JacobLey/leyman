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
     * @param [options] - optional
     * @param [options.title] - Add title to schema
     * @param [options.description] - Add description to schema
     * @param [options.deprecated] - flag schema as deprecated
     * @param [options.readOnly] - value should not be modified
     * @param [options.writeOnly] - value should be hidden
     * @returns new boolean schema
     */
    public static override create(
        this: void,
        options?: SchemaParams<boolean>
    ): BooleanSchema {
        return new BooleanSchema(options);
    }
}
