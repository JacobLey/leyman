import type { SchemaGenerics, SchemaParams, SchemaRef } from '../lib/schema.js';
import type { Nullable, Schema } from '../lib/types.js';
import { AbstractSchema, refSym } from '../lib/schema.js';

interface RecursiveGenerics<T, N extends boolean> extends SchemaGenerics<Nullable<T, N>> {
    params: SchemaParams<Nullable<T, N>>;
}

type AnyRecursiveSchema = RecursiveSchema<any, boolean>;

/**
 * Reference to a recursive definition, created by {@link defineRecursive}.
 *
 * Always emitted as a `$ref` to the definition. Only annotations and `nullable` can be added to it.
 *
 * @template T
 * @template N
 */
export class RecursiveSchema<T, N extends boolean = false> extends AbstractSchema<
    RecursiveGenerics<T, N>
> {
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
    declare public define: never;

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

    declare public nullable: (
        this: AnyRecursiveSchema
    ) => RecursiveSchema<T, boolean extends N ? boolean : true>;

    /**
     * Not applicable.
     */
    declare public oneOf: never;

    /**
     * Not applicable.
     */
    declare public ref: never;

    /**
     * Create a reference to a recursive definition. Use {@link defineRecursive}.
     *
     * @param [options] - schema params, including the reference
     * @returns recursive schema reference
     */
    public static override create<T>(this: void, options?: SchemaParams<T>): RecursiveSchema<T> {
        return new RecursiveSchema(options);
    }
}

/**
 * Define a schema that references itself, such as a tree.
 *
 * TypeScript can't infer a recursive type from a builder that uses itself, so declare the type explicitly.
 * The built schema must produce that type.
 *
 * The result is a reference to the definition, emitted as a `$ref` wherever it is used,
 * with the definition collected into `$defs` (see `define`).
 *
 * @example
 * interface TreeNode { value: number; children: TreeNode[] }
 *
 * const tree = defineRecursive<TreeNode>('TreeNode', self =>
 *     objectSchema({
 *         properties: { value: numberSchema(), children: arraySchema(self) },
 *         required: ['value', 'children'],
 *     })
 * );
 *
 * @param name - name of the definition, e.g. `TreeNode`
 * @param build - builds the definition, given a reference to itself
 * @returns reference to the definition
 */
export const defineRecursive = <T>(
    name: string,
    build: (self: RecursiveSchema<T>) => Schema<T>
): RecursiveSchema<T> => {
    const recursive: { schema: AbstractSchema<SchemaGenerics<T>> | null } = { schema: null };
    const ref: SchemaRef<AbstractSchema<SchemaGenerics<T>>> = {
        name,
        recursive,
        path: null,
        schema: null,
    };
    const reference = RecursiveSchema.create<T>({ [refSym]: ref });
    recursive.schema = build(reference) as AbstractSchema<SchemaGenerics<T>>;
    return reference;
};
