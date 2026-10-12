---
description: Every schema class, its JSON Schema and TypeScript equivalents, and the keywords it supports.
---

# Schemas

| Juniper class | JSON Schema | TypeScript |
|---|---|---|
| `ArraySchema` | `type: 'array'` | `unknown[]` |
| `BooleanSchema` | `type: 'boolean'` | `boolean` |
| `CustomSchema` | Whatever is provided | Whatever is provided |
| `EnumSchema` | `enum: []` | Union of the provided literals |
| `MergeSchema` | None (compositional) | `unknown`, then `\|` or `&` as appropriate |
| `NeverSchema` | `not: {}` | `never` |
| `NullSchema` | `type: 'null'` | `null` |
| `NumberSchema` | `type: 'number'` or `type: 'integer'` | `number` |
| `ObjectSchema` | `type: 'object'` | `{}` |
| `StringSchema` | `type: 'string'` | `string` |
| `TupleSchema` | `type: 'array'` | `[unknown]` |

- There is no `any` schema. Use `MergeSchema` for `unknown`. If `any` is truly required, use `CustomSchema`, whose default output is an always-valid empty schema.
- In the tables below, **Constructor parameter** means the keyword can be passed to the constructor as well as set with its method. **Can be unset** means the method accepts `undefined` to remove it. **Changes types** means it narrows the inferred TypeScript type.

## Generic schema methods

Available on every schema, except where the result would be nonsensical (for example, `EnumSchema` can't be `nullable`). All methods return a new instance.

| Method | Constructor parameter | Can be unset | Changes types |
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

## `EnumSchema`

Represents `enum: []`. TypeScript type: union of provided literals.

| Method | Constructor Parameter | Can be Unset | Changes Types | OpenAPI 3.0 |
|--------|:--------------------:|:------------:|:-------------:|:-----------:|
| [`enum(s)`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.1.2) | ✅ | ❌ | ✅ | ✅ |

## `NumberSchema`

Represents `type: 'number'` or `type: 'integer'`. TypeScript type: `number`.

| Method | Constructor Parameter | Can be Unset | Changes Types | OpenAPI 3.0 |
|--------|:--------------------:|:------------:|:-------------:|:-----------:|
| [`type`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.1.1) | ✅ | ✅ | ❌ | ✅ |
| [`multipleOf`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.1) | ✅ | ❌ | ❌ | ✅ |
| [`maximum`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.2) | ✅ | ✅ | ❌ | ✅ |
| [`exclusiveMaximum`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.3) | ✅ | ✅ | ❌ | ✅ |
| [`minimum`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.4) | ✅ | ✅ | ❌ | ✅ |
| [`exclusiveMinimum`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.5) | ✅ | ✅ | ❌ | ✅ |

## `ObjectSchema`

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
import { objectSchema, type SchemaType } from 'juniper';

const empty = objectSchema();
type EmptyObject = SchemaType<typeof empty>;
//   ^?

const indexed = empty.additionalProperties(true);
type IndexedObject = SchemaType<typeof indexed>;
//   ^?
```

**Note on `patternProperties`:** The key is a regular expression pattern and cannot be interpreted directly as a TypeScript string type. Wrap the key with the `PatternProperties` helper type:

```ts
import { numberSchema, objectSchema, type PatternProperties, type SchemaType } from 'juniper';

const startsOrEndsWith = objectSchema()
    .patternProperties(
        '^abc' as PatternProperties<`abc${string}`>,
        true
    )
    .patternProperties(
        'xyz$' as PatternProperties<`${string}xyz`>,
        numberSchema()
    );

type Output = SchemaType<typeof startsOrEndsWith>;
//   ^?
```

To derive variants of an object schema with `pick`, `omit`, `partial`, `required` and `extend`, see [Deriving object schemas](/juniper/guides/deriving-object-schemas).

## `StringSchema`

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

`format` autocompletes the formats defined by JSON Schema and OpenAPI 3.0 (`date-time`, `email`, `uuid`, `uri`, ..., exported as the `KnownFormat` type), and accepts any other string as a custom format.

## `TupleSchema`

Represents `type: 'array'` with strict tuple semantics. TypeScript type: `[unknown]`. A convenience wrapper around `ArraySchema` that prevents editing `items` directly. Every `TupleSchema` is an `ArraySchema`.

| Method | Constructor Parameter | Can be Unset | Changes Types | OpenAPI 3.0 |
|--------|:--------------------:|:------------:|:-------------:|:-----------:|
| [`uniqueItems`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.3) | ✅ | ✅ | ❌ | ✅ |
| [`contains`](https://json-schema.org/understanding-json-schema/reference/array.html#contains) | ❌ | ❌ | ✅ | ❌ |
| [`maxContains`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.4) | ✅ | ✅ | ❌ | ❌ |
| [`minContains`](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.5) | ✅ | ✅ | ❌ | ❌ |
| [`(prepend)prefixItem`](https://json-schema.org/understanding-json-schema/reference/array.html#tuple-validation) | ❌ | ❌ | ✅ | ❌ |

## `BooleanSchema`

Represents `type: 'boolean'`. TypeScript type: `boolean`.

Exposes all [generic schema methods](#generic-schema-methods). Does not expose `not` (use `EnumSchema` to restrict boolean values).

## `NullSchema`

Represents `type: 'null'`. TypeScript type: `null`.

Exposes all [generic schema methods](#generic-schema-methods).

## `NeverSchema`

Represents `not: {}`. TypeScript type: `never`.

Exposes all [generic schema methods](#generic-schema-methods).

## `MergeSchema`

A compositional schema with no inherent type constraint. TypeScript type: `unknown` initially, narrowed to `|` or `&` via `anyOf`/`allOf`. Use this for generic `unknown` types or to combine unrelated schemas.

Exposes all [generic schema methods](#generic-schema-methods).

## `CustomSchema`

Accepts arbitrary JSON Schema content. TypeScript type is provided via the generic parameter.

```ts
import { customSchema } from 'juniper';

const mySchema = customSchema<{ foo: string }>({ foo: { type: 'string' } });
```

Use `CustomSchema` when integrating with pre-existing JSON Schemas or adopting Juniper incrementally. Its use is discouraged in greenfield code.

