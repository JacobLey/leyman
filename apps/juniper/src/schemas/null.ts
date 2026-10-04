import type { SchemaGenerics, SchemaParams, SerializationParams } from '../lib/schema.js';
import type { JsonSchema, SchemaType } from '../lib/types.js';
import { AbstractSchema } from '../lib/schema.js';

/**
 * Schema for defining null literal.
 */
export class NullSchema extends AbstractSchema<SchemaGenerics<null>> {
    protected override readonly schemaType = 'null';

    /**
     * Not applicable.
     */
    declare public allOf: never;

    /**
     * Not applicable.
     */
    declare public anyOf: never;

    /**
     * Not enough possible states.
     */
    declare public if: never;

    /**
     * Not enough possible states.
     */
    declare public not: never;

    /**
     * Already nullable.
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
     * @returns new null schema
     */
    public static override create(this: void, options?: SchemaParams<null>): NullSchema {
        return new NullSchema(options);
    }

    /**
     * @override
     */
    protected override toSchema(params: SerializationParams): JsonSchema<SchemaType<this>> {
        const base = super.toSchema(params);

        if (params.openApi30) {
            delete base.type;
            base.enum = [null];
        }

        return base;
    }
}
