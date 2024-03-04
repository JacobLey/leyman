import {
    AbstractSchema,
    type SchemaGenerics,
    type SchemaParams,
    type SerializationParams,
} from '../lib/schema.js';
import type { JsonSchema, SchemaType } from '../lib/types.js';

/**
 * Schema for defining null literal.
 */
export class NullSchema extends AbstractSchema<SchemaGenerics<null>> {
    protected override readonly schemaType = 'null';

    /**
     * Not applicable.
     */
    public declare allOf: never;

    /**
     * Not applicable.
     */
    public declare anyOf: never;

    /**
     * Not enough possible states.
     */
    public declare if: never;

    /**
     * Not enough possible states.
     */
    public declare not: never;

    /**
     * Already nullable.
     */
    public declare nullable: never;

    /**
     * Not applicable.
     */
    public declare oneOf: never;

    /**
     * Create a new instance of NullSchema.
     *
     * @param {void} [this] - this
     * @param {object} [options] - options
     * @param {string} [options.title] - Add title to schema
     * @param {string} [options.description] - Add description to schema
     * @param {boolean} [options.deprecated] - flag schema as deprecated
     * @param {boolean} [options.readOnly] - value should not be modified
     * @param {boolean} [options.writeOnly] - value should be hidden
     * @returns {NullSchema} null schema
     */
    public static override create(
        this: void,
        options?: SchemaParams<null>
    ): NullSchema {
        return new NullSchema(options);
    }

    /**
     * @override
     */
    protected override toSchema(
        params: SerializationParams
    ): JsonSchema<SchemaType<this>> {
        const base = super.toSchema(params);

        if (params.openApi30) {
            delete base.type;
            base.enum = [null];
        }

        return base;
    }
}
