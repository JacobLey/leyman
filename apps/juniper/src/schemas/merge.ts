import {
    AbstractSchema,
    type ConditionalResult,
    type SchemaGenerics,
    type SchemaParams,
} from '../lib/schema.js';
import type { Schema, SchemaType } from '../lib/types.js';

type AnyMergeSchema = MergeSchema<any>;

/**
 * Schema for defining "merged" `anyOf` + `oneOf` sub-schemas.
 *
 * Useful when defining possibly overlapping schemas (as opposed to `oneOf` for a single type).
 *
 * Current typing is not able to detect duplicate/overlap types. Users must take caution
 * when merging types (e.g. multiple `nullable` schemas effectively makes `null` an invalid type).
 *
 * Similarly typescript types are not mutually exclusive.
 * e.g. `{ foo: 1, bar: 2 }` fulfills type `{ foo: number } | { bar: number }`;
 *
 * This schema without any conditions is effectively an `unknown` schema, allowing everything
 * to validate.
 *
 * @template T
 */
export class MergeSchema<T> extends AbstractSchema<SchemaGenerics<T>> {
    public declare allOf: <S extends Schema<unknown>>(
        this: AnyMergeSchema,
        schema: S
    ) => MergeSchema<SchemaType<S> & T>;

    public declare anyOf: <S extends Schema<unknown>>(
        this: AnyMergeSchema,
        schemas: S[]
    ) => MergeSchema<SchemaType<S> & T>;

    public declare if: <
        If extends AbstractSchema<SchemaGenerics<unknown>>,
        Then extends AbstractSchema<SchemaGenerics<unknown>>,
        Else extends AbstractSchema<SchemaGenerics<unknown>>,
    >(
        this: AnyMergeSchema,
        schema: If,
        conditionals: ConditionalResult<Then, Else>
    ) => MergeSchema<T & (SchemaType<Else> | (SchemaType<If> & SchemaType<Then>))>;

    public declare not: (this: AnyMergeSchema, schemas: Schema<unknown>) => this;

    /**
     * Not applicable.
     */
    public declare nullable: never;

    public declare oneOf: <S extends Schema<unknown>>(
        this: AnyMergeSchema,
        schemas: S[]
    ) => MergeSchema<SchemaType<S> & T>;

    /**
     * Create a new instance of MergeSchema.
     *
     * @param [options] - schemas or options object
     * @param [options.title] - Add title to schema
     * @param [options.description] - Add description to schema
     * @param [options.deprecated] - flag schema as deprecated
     * @param [options.readOnly] - value should not be modified
     * @param [options.writeOnly] - value should be hidden
     * @returns object schema
     */
    public static override create(
        this: void,
        options?: SchemaParams<unknown>
    ): MergeSchema<unknown> {
        return new MergeSchema(options);
    }
}
