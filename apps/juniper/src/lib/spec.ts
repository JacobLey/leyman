import type { ComponentsParams } from './schema.js';
import type { JsonSchema, OpenApi30JsonSchema, Schema } from './types.js';
import { components, isSchema } from './schema.js';

const componentsPath = '#/components/schemas/';

/**
 * Whether schemas are serialized for OpenAPI 3.0: as `options` says, or else if the document's
 * `openapi` version is 3.0.
 *
 * @template Spec - OpenAPI document
 * @template Options - options passed to {@link serializeSpec}
 */
type IsOpenApi30<Spec, Options> = Options extends { openApi30: infer O extends boolean }
    ? O
    : Spec extends { openapi: `3.0.${string}` }
      ? true
      : false;

/**
 * A value of an OpenAPI document, with every Juniper schema replaced by its JSON Schema.
 *
 * @template V - part of the document
 * @template OpenApi30 - serialized for OpenAPI 3.0
 */
export type SerializedSpecValue<V, OpenApi30 extends boolean> =
    V extends Schema<infer T>
        ? OpenApi30 extends true
            ? OpenApi30JsonSchema<T>
            : JsonSchema<T>
        : V extends object
          ? { [K in keyof V]: SerializedSpecValue<V[K], OpenApi30> }
          : V;

/**
 * An OpenAPI document returned by {@link serializeSpec}: every Juniper schema replaced by its JSON
 * Schema, and `components.schemas` holding every definition they use.
 *
 * @template Spec - OpenAPI document, with Juniper schemas
 * @template Options - options passed to {@link serializeSpec}
 */
export type SerializedSpec<Spec, Options = unknown> = SerializedSpecValue<
    Spec,
    IsOpenApi30<Spec, Options>
> & {
    components: {
        schemas: Record<
            string,
            IsOpenApi30<Spec, Options> extends true
                ? OpenApi30JsonSchema<unknown>
                : JsonSchema<unknown>
        >;
    };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/**
 * Serialize every Juniper schema in an OpenAPI document, and fill `components.schemas` with every
 * definition (see `define`) they use. Nothing has to be listed, so no `$ref` is left dangling.
 *
 * The dialect follows the document's `openapi` version: OpenAPI 3.0 for `3.0.x`, otherwise
 * JSON Schema 2020-12 (OpenAPI 3.1) with references at `#/components/schemas/`. A defined schema
 * placed in `components.schemas` under its own name is serialized there, rather than as a reference
 * to itself. The document isn't modified.
 *
 * @example
 * const spec = serializeSpec({
 *     openapi: '3.1.0',
 *     info: { title: 'Users', version: '1.0.0' },
 *     paths: { '/user': { get: { responses: { 200: { description: 'User', content: {
 *         'application/json': { schema: userSchema },
 *     } } } } } },
 * });
 * // spec.components.schemas.User is the serialized definition
 *
 * @param spec - OpenAPI document containing Juniper schemas
 * @param [options] - override the dialect and reference path chosen from `openapi`
 * @returns serialized document
 * @throws {Error} when `components.schemas` already has a different schema under a definition's name
 */
export const serializeSpec = <
    const Spec extends object,
    const Options extends ComponentsParams = ComponentsParams,
>(
    spec: Spec,
    options?: Options
): SerializedSpec<Spec, Options> => {
    const { openapi } = spec as { openapi?: unknown };
    const definitionsPath = options?.definitionsPath ?? componentsPath;
    const params: ComponentsParams = {
        definitionsPath,
        openApi30:
            options?.openApi30 ?? (typeof openapi === 'string' && openapi.startsWith('3.0.')),
    };
    const schemas: Schema<unknown>[] = [];
    const serialize = (value: unknown): unknown => {
        if (isSchema(value)) {
            schemas.push(value);
            return value.toJSON(params);
        }
        if (Array.isArray(value)) {
            return value.map(item => serialize(item));
        }
        if (isRecord(value)) {
            return Object.fromEntries(
                Object.entries(value).map(([key, item]) => [key, serialize(item)])
            );
        }
        return value;
    };

    const serialized = serialize(spec) as {
        components?: { schemas?: Record<string, unknown> };
    };
    const definitions = components(schemas, params);
    const existing = Object.entries(serialized.components?.schemas ?? {}).filter(
        // A defined schema under its own name serializes to a reference to itself, which its
        // definition replaces
        ([name, schema]) =>
            !(
                isRecord(schema) &&
                Object.keys(schema).length === 1 &&
                schema.$ref === `${definitionsPath}${name}`
            )
    );
    for (const [name, schema] of existing) {
        if (
            Object.hasOwn(definitions, name) &&
            JSON.stringify(schema) !== JSON.stringify(definitions[name])
        ) {
            throw new Error(`components.schemas has a different schema named "${name}"`);
        }
    }

    return {
        ...serialized,
        components: {
            ...serialized.components,
            // Sorted by name, like `components()`, so the output doesn't depend on the document's order
            schemas: Object.fromEntries(
                Object.entries({ ...Object.fromEntries(existing), ...definitions }).toSorted(
                    ([a], [b]) => (a < b ? -1 : Number(a > b))
                )
            ),
        },
    } as SerializedSpec<Spec, Options>;
};
