<div style="text-align:center">

# Juniper
Build JSON Schemas in TypeScript with inferred static types — strict, Ajv-ready, JSON Schema 2020-12 and OpenAPI 3.0 output.

[![npm package](https://badge.fury.io/js/juniper.svg)](https://www.npmjs.com/package/juniper)
[![License](https://img.shields.io/npm/l/juniper.svg)](https://github.com/JacobLey/leyman/blob/main/apps/juniper/LICENSE)

</div>

- **One source of truth** — write the schema once, get its TypeScript type with `SchemaType<typeof schema>`. Nothing to keep in sync.
- **Mistakes are compile errors** — each schema type only exposes the keywords that apply to it, so `maxLength` on an array or a `required` key missing from `properties` fails to build instead of silently validating everything.
- **Strict output** — emitted schemas pass [Ajv's strict mode](https://ajv.js.org/strict-mode.html), so they work with any standard JSON Schema validator.
- **Multiple targets** — emit JSON Schema 2020-12 (and OpenAPI 3.1), or `toJSON({ openApi30: true })` for OpenAPI 3.0's `nullable` dialect, from the same definition.
- **Reusable definitions** — `.define('User')` emits a schema as a `$ref` and bundles it into `$defs` (or OpenAPI `components`) automatically, so references never dangle.
- **Immutable builders** — every method returns a new schema, so shared base schemas can be safely extended, or narrowed with `pick`, `omit` and `partial`.

**Compared to**

- [TypeBox](https://www.npmjs.com/package/@sinclair/typebox) — also builds JSON Schema and types together, but focuses on covering JSON Schema rather than rejecting schemas that don't make sense.
- [zod](https://zod.dev/) / [joi](https://www.npmjs.com/package/joi) — validation libraries with their own schema formats; JSON Schema is an export, not the source.
- [typescript-json-schema](https://www.npmjs.com/package/typescript-json-schema) / [json-schema-to-typescript](https://www.npmjs.com/package/json-schema-to-typescript) — code generators that convert one way between TypeScript and JSON Schema, and can't stop you authoring a bad schema.

Juniper builds schemas; it does not validate data. Pair it with [Ajv](https://ajv.js.org/) or [juniper-validator](https://www.npmjs.com/package/juniper-validator).

For the full motivation, design goals and non-goals, see [WHY-JUNIPER.md](https://github.com/JacobLey/leyman/blob/main/apps/juniper/WHY-JUNIPER.md).

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [Schemas](#schemas)
- [Reusing schemas with define](#reusing-schemas-with-define)
- [API](#api)
- [Recipes](#recipes)
- [Also See](#also-see)

## Install

```sh
npm i juniper
```

## Example

```ts
import Ajv from 'ajv/dist/2020.js';
import { SchemaType, stringSchema, objectSchema } from 'juniper';

const schema = objectSchema({
    properties: {
        foo: stringSchema({
            maxLength: 10,
        }).startsWith('abc'),
        bar: stringSchema().nullable(),
        anything: true,
    },
    required: ['foo'],
    additionalProperties: false,
});

/**
 * {
 *    foo: `abc${string}`;
 *    bar?: string | null;
 *    anything?: unknown;
 * }
 */
type ISchema = SchemaType<typeof schema>;

/**
 * {
 *    type: 'object',
 *    properties: {
 *        foo: {
 *            type: 'string',
 *            maxLength: 10,
 *            pattern: '^abc',
 *        },
 *        bar: {
 *            type: ['string', 'null'],
 *        },
 *        anything: true,
 *    },
 *    required: ['foo'],
 *    additionalProperties: false,
 * }
 */
const jsonSchema = schema.toJSON();

const validator = new Ajv().compile<ISchema>(jsonSchema);

const unknownUserInput: unknown = getUserInput();

if (validator(unknownUserInput)) {
    console.log(unknownUserInput.foo); // abc123
}
```

## Usage

Juniper is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { stringSchema } = await import('juniper');`.

For every schema exported, there is both a class and functional constructor. The class can be instantiated directly via the `new` keyword, or via the static `create` method. The functional constructor is a reference to the `create` method. All three are equivalent:

```ts
import { StringSchema, stringSchema } from 'juniper';

// All methods are logically the same
const schema1 = new StringSchema({ maxLength: 10 });
const schema2 = StringSchema.create({ maxLength: 10 });
const schema3 = stringSchema({ maxLength: 10 })

console.log(schema3 instanceof StringSchema); // true
```

Juniper instances are **immutable**. Calling an instance method does not alter the existing instance. Every method that "alters" the schema returns a clone:

```ts
import { numberSchema } from 'juniper';

const schema1 = numberSchema({ type: 'integer' });
const schema2 = schema1.multipleOf(5);

console.log(schema1 === schema2); // false
console.log(schema1.toJSON()); // { type: 'integer' }
console.log(schema2.toJSON()); // { type: 'integer', multipleOf: 5 }
```

Juniper is designed to be used with TypeScript. While it can be used in a JavaScript environment, a significant portion of the value — including type inference and compile-time schema validation — requires TypeScript. Many schema restrictions are enforced only at the TypeScript level:

```ts
import { booleanSchema, objectSchema } from 'juniper';

const bool = booleanSchema().anyOf([
    booleanSchema({ description: 'provides no extra benefit' })
]);

const obj = objectSchema({
    properties: {
        foo: 123,
    },
    // FOO does not exist in properties
    required: ['FOO'],
}).properties({
    // already assigned above
    foo: booleanSchema(),
}).oneOf([
    // An object cannot also be a boolean
    bool
]);
```

The above code fails TypeScript validation. It does not necessarily fail at runtime, and the resulting JSON Schema may be nonsensical.

## Schemas

Juniper exports the following schema classes with their JSON Schema and TypeScript equivalents:

Juniper Class | JSON Schema | TypeScript
---|---|---
`ArraySchema` | `type: 'array'` | `unknown[]`
`BooleanSchema` | `type: 'boolean'` | `boolean`
`CustomSchema` | N/A (whatever is provided) | N/A (whatever is provided)
`EnumSchema` | `enum: []` | Union `\|` of provided literals
`MergeSchema` | N/A (compositional schema) | `unknown`, then `\|` or `&` as appropriate
`NeverSchema` | `not: {}` | `never`
`NullSchema` | `type: 'null'` | `null`
`NumberSchema` | `type: 'number'` OR `type: 'integer'` | `number`
`ObjectSchema` | `type: 'object'` | `{}`
`StringSchema` | `type: 'string'` | `string`
`TupleSchema` | `type: 'array'` | `[unknown]`

Notes:

- `NumberSchema` can emit type `integer` or `number` (default) based on the `type` field. This does not impact TypeScript typings.
- `MergeSchema` without merging anything is a generic `unknown`. Methods like `allOf` and `anyOf` can produce unions such as `number | string`.
- `TupleSchema` is a convenience wrapper around `ArraySchema` that enforces strict tuples. The same result can be achieved with `ArraySchema` directly.
- `CustomSchema` is for breaking out of the Juniper environment. Its use is discouraged but may be the best option when integrating with existing JSON Schemas or for gradual adoption.
- There is no `any` schema. Use `MergeSchema` for `unknown`. If `any` is truly required, use `CustomSchema` (default output is an always-valid empty schema).

## Reusing schemas with define

`.define(name)` makes a schema a reusable definition. Wherever it is used, it is emitted as a `$ref`, and `toJSON()` adds every definition it references to `$defs`. You reference the schema variable itself, so types flow exactly as they do without `define`, and a reference can never point at a missing definition.

```ts
import { arraySchema, objectSchema, SchemaType, stringSchema } from 'juniper';

const address = objectSchema({
    properties: { city: stringSchema() },
    required: ['city'],
}).define('Address');

const user = objectSchema({
    properties: { home: address, work: address.nullable() },
}).define('User');

arraySchema(user).toJSON();
/**
 * {
 *   type: 'array',
 *   items: { $ref: '#/$defs/User' },
 *   $defs: {
 *     Address: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
 *     User: {
 *       type: 'object',
 *       properties: {
 *         home: { $ref: '#/$defs/Address' },
 *         work: { anyOf: [{ $ref: '#/$defs/Address' }, { type: 'null' }] },
 *       },
 *     },
 *   },
 * }
 */

// { home?: { city: string }; work?: { city: string } | null }
type User = SchemaType<typeof user>;
```

- **Derived schemas:** a schema derived from a definition keeps the `$ref` when it only adds annotations (`description`, `title`, `examples`, ...) or is made `nullable()`. Any other change, such as `omit()` or an extra constraint, makes it a different schema, so it is emitted inline. Define it under its own name to share it too: `user.omit(['id']).define('NewUser')`.
- **Names are unique:** two different schemas defined with the same name throw when serialized. The same schema can be used any number of times.
- **`.ref(path)`** remains for schemas Juniper doesn't own, where the path is up to you.

### OpenAPI

OpenAPI keeps shared schemas in `components.schemas`. `components()` collects every definition reachable from the given schemas, ready to place there. With `openApi30: true`, references already point at `#/components/schemas/`. For OpenAPI 3.1 (JSON Schema 2020-12), pass `definitionsPath`.

```ts
import { components } from 'juniper';

// OpenAPI 3.0: { openApi30: true }
const options = { definitionsPath: '#/components/schemas/' };

const spec = {
    openapi: '3.1.0',
    components: { schemas: components([user, newUser, post], options) },
    paths: {
        '/users/{userId}': {
            get: {
                responses: {
                    200: {
                        description: 'User',
                        content: { 'application/json': { schema: user.toJSON(options) } },
                    },
                },
            },
        },
    },
};
```

A complete users and posts API, built with [openapi3-ts](https://www.npmjs.com/package/openapi3-ts) and checked to be valid OpenAPI 3.0 and 3.1, is in [e2e/juniper-openapi](https://github.com/JacobLey/leyman/blob/main/e2e/juniper-openapi/test/data/api.ts).

## API

### Helper Types

| Type | Interface | Description |
|------|-----------|-------------|
| `SchemaType` | `SchemaType<Schema>` \| `SchemaType<JSON>` | Extracts the TypeScript type from a Juniper class or JSON Schema object. |
| `Schema` | `Schema<number>` | A Juniper Schema instance describing a TypeScript interface. Usable for rendering to JSON or passing as a parameter to other Juniper instances. |
| `JSONSchema` | `JSONSchema<number>` | A JSON Schema object describing the specified TypeScript type. |
| `EmptyObject` | `EmptyObject` | Describes an actually-empty object. Mostly internal but exposed for convenience. |
| `PatternProperties` | ``PatternProperties<`abc${string}`>`` | Describes a string pattern type. See [`ObjectSchema.patternProperties`](#objectschema). |

### Constructors

Every schema can be created three ways:

- `new` keyword — `new StringSchema({ maxLength: 5 })`
- static `create` method — `StringSchema.create({ maxLength: 5 })`
- functional constructor — `stringSchema({ maxLength: 5 })`

All three are equivalent. Every constructor takes a single options object. Every parameter is optional and can also be set via a method of the same name:

```ts
stringSchema({ maxLength: 5 }) == StringSchema.create().maxLength(5) == new StringSchema({}).maxLength(5)
```

Not every property can be set in the constructor — some must be set via method due to TypeScript inference limitations. Schema constructors make heavy use of TypeScript generics. These generics are internal and may change without announcement. The exception is `CustomSchema`, whose type is provided via the generic parameter.

Every method returns a clone of the original instance (immutable).

### Generic Schema Helper Methods

The following methods are available on every schema instance for rendering and typing.

---

#### `.toJSON(options?)`

Renders the JSON Schema document. The result should be immediately passed to a validator or serializer. The internal structure is not guaranteed and should not be modified.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `openApi30` | `boolean` | `false` | Output a JSON Schema compliant with OpenAPI 3.0. Not every property is fully supported — see implementation warnings. |
| `id` | `string` | — | Value to place in the `$id` field of the document. |
| `schema` | `boolean` | `false` | Include the draft as the `$schema` property. |
| `definitionsPath` | `string` | `'#/$defs/'` (`'#/components/schemas/'` with `openApi30`) | `$ref` prefix for [defined](#reusing-schemas-with-define) schemas. Only `#/$defs/` is embedded in the output; use `components()` for other paths. |

**Returns** `object` — the rendered JSON Schema document.

---

#### `.ref(path)`

Returns a schema (which can be modified further) that extends the schema via the [`$ref`](https://json-schema.org/understanding-json-schema/structuring.html#ref) property.

Prefer [`.define(name)`](#reusing-schemas-with-define) for schemas you build with Juniper: it places the definition for you. `.ref(path)` is for schemas stored somewhere Juniper doesn't control.

**Parameters**

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
const nullableResourceSchema = mergeSchema().oneOf([
    resourceSchema,
    nullSchema
]);
```

---

#### `.define(name)`

Makes the schema a reusable definition, emitted as `$ref` and collected into `$defs`. See [Reusing schemas with define](#reusing-schemas-with-define).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | `string` | — | Required. Name of the definition, e.g. `User`. Must be unique per document. |

---

#### `components(schemas, options?)`

Collects every definition used by `schemas` (including defined schemas themselves), keyed by name. For documents that keep definitions outside the schema, such as OpenAPI's `components.schemas`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `schemas` | `Schema[]` | — | Required. Schemas whose definitions to collect. |
| `options.openApi30` | `boolean` | `false` | Serialize definitions for OpenAPI 3.0. |
| `options.definitionsPath` | `string` | `'#/components/schemas/'` | `$ref` prefix. Pass the same options to `toJSON` for schemas that use them. |

**Throws** when different schemas are defined with the same name.

---

#### `.cast<T>()`

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

---

#### `.metadata(key, value)` / `.metadata(record)`

Attaches custom data to a JSON Schema. Useful for extensions like [`x-` prefixes in OpenAPI](https://swagger.io/specification/#specification-extensions).

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `key` | `string` | — | The metadata key. Must not overlap with existing JSON Schema keywords. |
| `value` | `unknown` | — | The metadata value. |

Alternatively, pass a single object `{ key1: val1, key2: val2 }` to set multiple metadata entries at once.

`numberSchema().metadata('maximum', 5)` is forbidden — `maximum` is an existing keyword.

---

### Generic Schema Methods

The following methods are available on every schema. All methods return a new (cloned) instance.

| Method | Constructor Parameter | Can be Unset | Changes Types |
|--------|:--------------------:|:------------:|:-------------:|
| [`title`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.1) | ✅ | ✅ | ❌ |
| [`description`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.1) | ✅ | ✅ | ❌ |
| [`default`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.2) | ✅ | ✅ | ❌ |
| [`deprecated`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.3) | ✅ | ✅ | ❌ |
| [`example(s)`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.5) | ❌ | ❌ | ❌ |
| [`readOnly`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.4) | ✅ | ✅ | ❌ |
| [`writeOnly`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.4) | ✅ | ✅ | ❌ |
| [`allOf`](https://json-schema.org/understanding-json-schema/reference/combining.html#allof) | ❌ | ❌ | ✅ |
| [`anyOf`](https://json-schema.org/understanding-json-schema/reference/combining.html#anyof) | ❌ | ❌ | ✅ |
| [`oneOf`](https://json-schema.org/understanding-json-schema/reference/combining.html#oneof) | ❌ | ❌ | ✅ |
| [`not`](https://json-schema.org/understanding-json-schema/reference/combining.html#not) | ❌ | ❌ | ✅ |
| [`if then else`](https://json-schema.org/understanding-json-schema/reference/conditionals.html#if-then-else) | ❌ | ❌ | ✅ |
| [`nullable`](https://swagger.io/docs/specification/data-models/data-types/#null) | ❌ | ❌ | ✅ |

Individual schemas may not expose every method when the result would be nonsensical or forbidden (e.g. `EnumSchema` cannot be `nullable`).

---

### `ArraySchema`

Represents `type: 'array'`. TypeScript type: `unknown[]`.

| Method | Constructor Parameter | Can be Unset | Changes Types | OpenAPI 3.0 |
|--------|:--------------------:|:------------:|:-------------:|:-----------:|
| [`items`](https://json-schema.org/understanding-json-schema/reference/array.html#items) | ✅ | ❌ | ✅ | ✅ |
| [`maxItems`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.1) | ✅ | ✅ | ❌ | ✅ |
| [`minItems`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.2) | ✅ | ✅ | ❌ | ✅ |
| [`uniqueItems`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.3) | ✅ | ✅ | ❌ | ✅ |
| [`contains`](https://json-schema.org/understanding-json-schema/reference/array.html#contains) | ❌ | ❌ | ✅ | ❌ |
| [`maxContains`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.4) | ✅ | ✅ | ❌ | ❌ |
| [`minContains`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.5) | ✅ | ✅ | ❌ | ❌ |
| [`(prepend)prefixItem`](https://json-schema.org/understanding-json-schema/reference/array.html#tuple-validation) | ❌ | ❌ | ✅ | ❌ |

---

### `EnumSchema`

Represents `enum: []`. TypeScript type: union of provided literals.

| Method | Constructor Parameter | Can be Unset | Changes Types | OpenAPI 3.0 |
|--------|:--------------------:|:------------:|:-------------:|:-----------:|
| [`enum(s)`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.1.2) | ✅ | ❌ | ✅ | ✅ |

---

### `NumberSchema`

Represents `type: 'number'` or `type: 'integer'`. TypeScript type: `number`.

| Method | Constructor Parameter | Can be Unset | Changes Types | OpenAPI 3.0 |
|--------|:--------------------:|:------------:|:-------------:|:-----------:|
| [`type`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.1.1) | ✅ | ✅ | ❌ | ✅ |
| [`multipleOf`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.1) | ✅ | ❌ | ❌ | ✅ |
| [`maximum`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.2) | ✅ | ✅ | ❌ | ✅ |
| [`exclusiveMaximum`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.3) | ✅ | ✅ | ❌ | ✅ |
| [`minimum`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.4) | ✅ | ✅ | ❌ | ✅ |
| [`exclusiveMinimum`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.5) | ✅ | ✅ | ❌ | ✅ |

---

### `ObjectSchema`

Represents `type: 'object'`. TypeScript type: `{}`.

| Method | Constructor Parameter | Can be Unset | Changes Types | OpenAPI 3.0 |
|--------|:--------------------:|:------------:|:-------------:|:-----------:|
| [`properties`](https://json-schema.org/understanding-json-schema/reference/object.html#properties) | ✅ | ✅ | ✅ | ✅ |
| [`maxProperties`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.5.1) | ✅ | ✅ | ❌ | ✅ |
| [`minProperties`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.5.2) | ✅ | ✅ | ❌ | ✅ |
| [`required`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.5.3) | ✅ | ✅ | ✅ | ✅ |
| [`additionalProperties`](https://json-schema.org/understanding-json-schema/reference/object.html#additional-properties) | ✅ | ✅ | ✅ | ✅ |
| [`patternProperties`](https://json-schema.org/understanding-json-schema/reference/object.html#pattern-properties) | ❌ | ✅ | ✅ | ❌ |
| [`dependentRequired`](https://json-schema.org/understanding-json-schema/reference/conditionals.html#dependentrequired) | ❌ | ❌ | ✅ | ✅ |
| [`dependentSchemas`](https://json-schema.org/understanding-json-schema/reference/conditionals.html#dependentschemas) | ❌ | ❌ | ✅ | ✅ |
| [`unevaluatedProperties`](https://json-schema.org/understanding-json-schema/reference/object.html#unevaluated-properties) | ✅ | ❌ | ❌ | ❌ |

**Note on `additionalProperties`:** JSON Schema interprets omitting `additionalProperties` as `additionalProperties: true`. The emitted TypeScript type includes the index signature only when `additionalProperties` is explicitly set to `true`:

```ts
import { objectSchema, SchemaType } from 'juniper';

const empty = objectSchema();
// EmptyObject — no index signature
type EmptyObject = SchemaType<typeof empty>;

const indexed = empty.additionalProperties(true);
// Record<string, unknown>
type IndexedObject = SchemaType<typeof indexed>;
```

**Note on `patternProperties`:** The key is a regular expression pattern and cannot be interpreted directly as a TypeScript string type. Wrap the key with the `PatternProperties` helper type:

```ts
import { numberSchema, objectSchema, PatternProperties, SchemaType } from 'juniper';

const startsOrEndsWith = objectSchema()
    .patternProperties(
        '^abc' as PatternProperties<`abc${string}`>,
        true
    )
    .patternProperties(
        'xyz$' as PatternProperties<`${string}xyz`>,
        numberSchema()
    );

// Record<`abc${string}`, unknown> & Record<`${string}xyz`, number>
type Output = SchemaType<typeof startsOrEndsWith>;
```

**Deriving schemas with `pick`, `omit` and `partial`:** Build variants of an object schema, such as the create, update and response shapes of the same resource. They only change `properties` and `required`. Every other keyword (`additionalProperties`, `title`, ...) is kept, so reset any that no longer fit.

```ts
import { numberSchema, objectSchema, SchemaType, stringSchema } from 'juniper';

const user = objectSchema({
    properties: {
        id: numberSchema(),
        name: stringSchema(),
        email: stringSchema(),
    },
    required: ['id', 'name'],
    additionalProperties: false,
});

const createUser = user.omit(['id']);
// { name: string; email?: string }
type CreateUser = SchemaType<typeof createUser>;

// { name?: string; email?: string }
const updateUser = createUser.partial();

// { id: number; name?: string }, only `name` is optional
const summary = user.pick(['id', 'name']).partial(['name']);
```

Keys are checked against the schema's properties, so a typo is a compile error. Constraints added by combining schemas (`allOf`, `if`, `dependentRequired`, ...) still apply to the result, in both the JSON Schema and its type. For example, a property required through `dependentRequired` stays required after `partial()`.

---

### `StringSchema`

Represents `type: 'string'`. TypeScript type: `string`.

| Method | Constructor Parameter | Can be Unset | Changes Types | OpenAPI 3.0 |
|--------|:--------------------:|:------------:|:-------------:|:-----------:|
| [`format`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.7) | ✅ | ✅ | ❌ | ✅ |
| [`maxLength`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.3.1) | ✅ | ✅ | ❌ | ✅ |
| [`minLength`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.3.1) | ✅ | ✅ | ❌ | ✅ |
| [`pattern`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.3.3) | ✅ | ❌ | ❌ | ✅ |
| `startsWith` | ❌ | ❌ | ✅ | ✅ |
| `endsWith` | ❌ | ❌ | ✅ | ✅ |
| `contains` | ❌ | ❌ | ✅ | ✅ |
| [`contentEncoding`](https://json-schema.org/understanding-json-schema/reference/non_json_data.html#contentencoding) | ✅ | ✅ | ❌ | ✅ |
| [`contentMediaType`](https://json-schema.org/understanding-json-schema/reference/non_json_data.html#contentmediatype) | ✅ | ✅ | ❌ | ✅ |

`startsWith`, `endsWith`, and `contains` are wrappers around the `pattern` property with special TypeScript handling to narrow the inferred string type (e.g. `startsWith('abc')` produces `` `abc${string}` ``).

---

### `TupleSchema`

Represents `type: 'array'` with strict tuple semantics. TypeScript type: `[unknown]`. A convenience wrapper around `ArraySchema` that prevents editing `items` directly. Every `TupleSchema` is an `ArraySchema`.

| Method | Constructor Parameter | Can be Unset | Changes Types | OpenAPI 3.0 |
|--------|:--------------------:|:------------:|:-------------:|:-----------:|
| [`uniqueItems`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.3) | ✅ | ✅ | ❌ | ✅ |
| [`contains`](https://json-schema.org/understanding-json-schema/reference/array.html#contains) | ❌ | ❌ | ✅ | ❌ |
| [`maxContains`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.4) | ✅ | ✅ | ❌ | ❌ |
| [`minContains`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.5) | ✅ | ✅ | ❌ | ❌ |
| [`(prepend)prefixItem`](https://json-schema.org/understanding-json-schema/reference/array.html#tuple-validation) | ❌ | ❌ | ✅ | ❌ |

---

### `BooleanSchema`

Represents `type: 'boolean'`. TypeScript type: `boolean`.

Exposes all [generic schema methods](#generic-schema-methods). Does not expose `not` (use `EnumSchema` to restrict boolean values).

---

### `NullSchema`

Represents `type: 'null'`. TypeScript type: `null`.

Exposes all [generic schema methods](#generic-schema-methods).

---

### `NeverSchema`

Represents `not: {}`. TypeScript type: `never`.

Exposes all [generic schema methods](#generic-schema-methods).

---

### `MergeSchema`

A compositional schema with no inherent type constraint. TypeScript type: `unknown` initially, narrowed to `|` or `&` via `anyOf`/`allOf`. Use this for generic `unknown` types or to combine unrelated schemas.

Exposes all [generic schema methods](#generic-schema-methods).

---

### `CustomSchema`

Accepts arbitrary JSON Schema content. TypeScript type is provided via the generic parameter.

```ts
import { customSchema } from 'juniper';

const mySchema = customSchema<{ foo: string }>({ foo: { type: 'string' } });
```

Use `CustomSchema` when integrating with pre-existing JSON Schemas or adopting Juniper incrementally. Its use is discouraged in greenfield code.

## Recipes

### TypeScript Enum

TypeScript `enums` are object dictionaries that sometimes have [reverse mappings](https://www.typescriptlang.org/docs/handbook/enums.html#reverse-mappings), so you cannot trivially get all values via `Object.values`. The [enum-to-array](https://www.npmjs.com/package/enum-to-array) package resolves this:

```ts
import { enumToValues } from 'enum-to-array';
import { enumSchema } from 'juniper';

enum MyEnum {
    FOO = 'BAR',
    ABC = 123,
}

enumSchema({
    enum: enumToValues(MyEnum)
}).toJSON();
// { enum: ['BAR', 123] }
```

## Also See

- [WHY-JUNIPER.md](https://github.com/JacobLey/leyman/blob/main/apps/juniper/WHY-JUNIPER.md) — Motivation, design decisions, and comparison to alternative libraries.
- [juniper-validator](https://www.npmjs.com/package/juniper-validator) — Validation companion for Juniper schemas.
