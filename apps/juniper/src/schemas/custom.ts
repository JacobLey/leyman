import type { SchemaGenerics } from '../lib/schema.js';
import type { JsonSchema, SchemaType } from '../lib/types.js';
import { AbstractSchema } from '../lib/schema.js';

/**
 * "Schema" for importing your own custom JSON Schema document.
 *
 * __Any schema or typing is not validated__
 *
 * Useful for times when a schema document is controlled elsewhere, or gradual
 * adoption of Juniper.
 *
 * Provided schema is returned as a shallow clone.
 *
 * @template T
 */
export class CustomSchema<T> extends AbstractSchema<SchemaGenerics<T>> {
    readonly #schema: unknown;

    /**
     * Not applicable.
     */
    declare public title: never;

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
    declare public description: never;

    /**
     * Not applicable.
     */
    declare public default: never;

    /**
     * Not applicable.
     */
    declare public deprecated: never;

    /**
     * Not applicable.
     */
    declare public example: never;

    /**
     * Not applicable.
     */
    declare public examples: never;

    /**
     * Not applicable.
     */
    declare public readOnly: never;

    /**
     * Not applicable.
     */
    declare public writeOnly: never;

    /**
     * Not applicable.
     */
    declare public if: never;

    /**
     * Not applicable.
     */
    declare public metadata: never;

    /**
     * Not applicable.
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
     * Not applicable.
     */
    declare public define: never;

    /**
     * Not applicable.
     */
    declare public ref: never;

    /**
     * @override
     */
    public constructor(options: Record<string, unknown> = {}) {
        super();
        this.#schema = options;
    }

    /**
     * Create a new instance of CustomSchema.
     *
     * @param [schema] - raw JSON Schema
     * @returns new custom schema
     */
    public static override create<T>(
        this: void,
        schema?: Record<string, unknown>
    ): CustomSchema<T> {
        return new CustomSchema(schema);
    }

    /**
     * Takes no options, as schema is defined internally.
     *
     * @param this - this instance
     * @returns serializable JSON Schema
     */
    public override toJSON(this: this): JsonSchema<SchemaType<this>> {
        return this.toSchema();
    }

    /**
     * @override
     */
    protected override toSchema(): JsonSchema<SchemaType<this>> {
        return { ...(this.#schema as JsonSchema<SchemaType<this>>) };
    }
}
