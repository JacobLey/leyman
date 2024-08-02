import { AbstractSchema, type SchemaGenerics } from '../lib/schema.js';
import type { JsonSchema, SchemaType } from '../lib/types.js';

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
    public declare title: never;

    /**
     * Not applicable.
     */
    public declare allOf: never;

    /**
     * Not applicable.
     */
    public declare anyOf: never;

    /**
     * Not applicable.
     */
    public declare description: never;

    /**
     * Not applicable.
     */
    public declare default: never;

    /**
     * Not applicable.
     */
    public declare deprecated: never;

    /**
     * Not applicable.
     */
    public declare example: never;

    /**
     * Not applicable.
     */
    public declare examples: never;

    /**
     * Not applicable.
     */
    public declare readOnly: never;

    /**
     * Not applicable.
     */
    public declare writeOnly: never;

    /**
     * Not applicable.
     */
    public declare if: never;

    /**
     * Not applicable.
     */
    public declare metadata: never;

    /**
     * Not applicable.
     */
    public declare not: never;

    /**
     * Not applicable.
     */
    public declare nullable: never;

    /**
     * Not applicable.
     */
    public declare oneOf: never;

    /**
     * Not applicable.
     */
    public declare ref: never;

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
