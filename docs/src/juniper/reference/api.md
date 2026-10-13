---
description: Rendering, definitions, helper types and constructors shared by every schema.
---

# API

## Constructors

Every schema can be created three equivalent ways:

```ts
import { StringSchema, stringSchema } from 'juniper';

new StringSchema({ maxLength: 5 });
StringSchema.create({ maxLength: 5 });
stringSchema({ maxLength: 5 });
```

Every constructor takes a single options object. Every option is optional, and can also be set with the method of the same name, so `stringSchema({ maxLength: 5 })` is the same as `stringSchema().maxLength(5)`.

Some keywords can only be set with a method, because TypeScript can't infer them from the constructor. The constructors' generics are internal and may change without notice. The exception is `CustomSchema`, whose type is its generic parameter.

## Helper types

| Type | Example | Description |
|------|---------|-------------|
| `SchemaType` | `SchemaType<typeof schema>` | The TypeScript type of a Juniper schema, or of a JSON Schema object. |
| `Schema` | `Schema<number>` | A Juniper schema describing a TypeScript type. Accept it as a parameter to take any schema of that type. |
| `JsonSchema` | `JsonSchema<number>` | A rendered JSON Schema object describing a TypeScript type. |
| `EmptyObject` | `EmptyObject` | An object with no properties. Mostly internal. |
| `PatternProperties` | ``PatternProperties<`abc${string}`>`` | A string pattern type, for [`patternProperties`](/juniper/reference/schemas#objectschema). |
| `KnownFormat` | `KnownFormat` | String formats defined by JSON Schema and OpenAPI 3.0, for [`format`](/juniper/reference/schemas#stringschema). |

`Schema` lets functions accept any schema that describes a type:

```ts
import { numberSchema, stringSchema, type Schema } from 'juniper';

const describe = (schema: Schema<string>) => schema.toJSON();

describe(stringSchema());
// @errors: 2345
describe(numberSchema());
```

## `.toJSON(options?)`

Renders the JSON Schema document. The result should be immediately passed to a validator or serializer. The internal structure is not guaranteed and should not be modified.

The output is deterministic: the same schema always renders the same JSON, and `$defs` (like `components()`) are sorted by name rather than by where they are used. Committed schema or OpenAPI files only change when the schema does.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `openApi30` | `boolean` | `false` | Output a JSON Schema compliant with OpenAPI 3.0. Keywords 3.0 lacks are rewritten where possible, and dropped otherwise, so the schema may accept more than its 2020-12 form. The [OpenAPI 3.0 column](/juniper/reference/schemas) lists which keywords are kept. |
| `id` | `string` | — | Value to place in the `$id` field of the document. |
| `schema` | `boolean` | `false` | Include the draft as the `$schema` property. |
| `definitionsPath` | `string` | `'#/$defs/'` (`'#/components/schemas/'` with `openApi30`) | `$ref` prefix for [defined](/juniper/guides/reusing-schemas) schemas. Only `#/$defs/` is embedded in the output; use `components()` for other paths. |

**Returns** `object` — the rendered JSON Schema document.

## `['~standard']`

Every schema implements [Standard JSON Schema](https://standardschema.dev/), so libraries that accept it can render Juniper schemas themselves.

```ts
import { stringSchema } from 'juniper';

const schema = stringSchema().nullable();

schema['~standard'].jsonSchema.input({ target: 'openapi-3.0' });
// { type: 'string', nullable: true }
```

| Target | Same as |
|--------|---------|
| `'draft-2020-12'` | `toJSON()` |
| `'openapi-3.0'` | `toJSON({ openApi30: true })` |

Other targets throw. `input` and `output` render the same schema, and accept the other `toJSON` options as a second argument.

## `.ref(path)`

Returns a schema (which can be modified further) that extends the schema via the [`$ref`](https://json-schema.org/understanding-json-schema/structuring.html#ref) property.

Prefer [`.define(name)`](/juniper/guides/reusing-schemas) for schemas you build with Juniper: it places the definition for you. `.ref(path)` is for schemas stored somewhere Juniper doesn't control.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | `string` | — | Required. Path to where the schema is actually stored in the document. Final document structure is implementation-specific and not verifiable. |

If referencing a JSON Schema entirely outside of Juniper's control, use `ref` on a `CustomSchema`. Otherwise it is designed for instances where common schemas are pulled into a reusable section, such as [OpenAPI's `components`](https://swagger.io/docs/specification/components/).

```ts
import { stringSchema, objectSchema } from 'juniper';

// string
const idSchema = stringSchema({
    title: 'Custom ID',
    pattern: '^[a-z]{32}$',
});

// { id: string } | null
const resourceSchema = objectSchema({
    properties: {
        id: idSchema.ref('#/components/schemas/id')
    },
    required: ['id'],
});

const nullableResourceSchema = resourceSchema.ref('#/components/schemas/id').nullable();

console.log({
    components: {
        schemas: {
            id: idSchema.toJSON({ openApi30: true }),
            resource: resourceSchema.toJSON({ openApi30: true }),
            nullableResource: nullableResourceSchema.toJSON({ openApi30: true }),
        },
    },
});
/**
 * {
 *   components: {
 *     schemas: {
 *       id: {
 *          type: 'string',
 *          title: 'Custom ID',
 *          pattern: '^[a-z]{32}$'
 *       },
 *       resource: {
 *          type: 'object',
 *          properties: {
 *            id: { $ref: '#/components/schemas/id' }
 *          },
 *          required: ['id'],
 *       },
 *       nullableResource: {
 *          $ref: '#/components/schemas/resource',
 *          nullable: true
 *       },
 *     }
 *   }
 * }
 */
```

Note: the `nullableResource` above merges `$ref` with additional properties (allowed in Draft 2020-12 and generally supported by resolvers, but not strictly compliant with OpenAPI). For full compliance, merge with a `NullSchema` explicitly:

```ts
import { objectSchema, stringSchema } from 'juniper';

const resourceSchema = objectSchema({
    properties: { id: stringSchema() },
    required: ['id'],
});
// ---cut---
import { mergeSchema, nullSchema } from 'juniper';

const nullableResourceSchema = mergeSchema().oneOf([
    resourceSchema,
    nullSchema(),
]);
```

## `.define(name)`

Makes the schema a reusable definition, emitted as `$ref` and collected into `$defs`. See [Reusing schemas with define](/juniper/guides/reusing-schemas).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | `string` | — | Required. Name of the definition, e.g. `User`. Must be unique per document. |

## `defineRecursive<T>(name, build)`

Defines a schema that references itself. See [Recursive schemas](/juniper/guides/reusing-schemas#recursive-schemas).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | `string` | — | Required. Name of the definition. |
| `build` | `(self: RecursiveSchema<T>) => Schema<T>` | — | Required. Builds the definition, given a reference to itself. Must produce `T`. |

**Returns** `RecursiveSchema<T>` — a reference to the definition.

## `components(schemas, options?)`

Collects every definition used by `schemas` (including defined schemas themselves), keyed and sorted by name. For documents that keep definitions outside the schema, such as OpenAPI's `components.schemas`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `schemas` | `Schema[]` | — | Required. Schemas whose definitions to collect. |
| `options.openApi30` | `boolean` | `false` | Serialize definitions for OpenAPI 3.0. |
| `options.definitionsPath` | `string` | `'#/components/schemas/'` | `$ref` prefix. Pass the same options to `toJSON` for schemas that use them. |

**Throws** when different schemas are defined with the same name.

## `.cast<T>()`

Casts the instance as a schema for a specific TypeScript type. Can only be chained with a `toJSON` call after casting. Useful when declaring a schema for JavaScript-generated objects that are not explicitly enforced in JSON Schema.

```ts
import { objectSchema } from 'juniper';

const kindSym = Symbol.for('kind');

const userSchema = objectSchema({
    properties: {
        id: true,
        email: true,
    },
    additionalProperties: false,
}).cast<{
    [kindSym]: 'user';
    id: string;
    email: string;
}>();
```

## `.metadata(key, value)` / `.metadata(record)`

Attaches custom data to a JSON Schema. Useful for extensions like [`x-` prefixes in OpenAPI](https://swagger.io/specification/#specification-extensions).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `key` | `string` | — | The metadata key. Must not overlap with existing JSON Schema keywords. |
| `value` | `unknown` | — | The metadata value. |

Alternatively, pass a single object `{ key1: val1, key2: val2 }` to set multiple metadata entries at once.

`numberSchema().metadata('maximum', 5)` is forbidden — `maximum` is an existing keyword.

