<div style="text-align:center">

# Juniper
ESM JSON Schema builder for static Typescript inference

[![npm package](https://badge.fury.io/js/juniper.svg)](https://www.npmjs.com/package/juniper)
[![License](https://img.shields.io/npm/l/juniper.svg)](https://github.com/JacobLey/leyman/blob/main/apps/juniper/LICENSE)

</div>

## Contents
- [Introduction](#introduction)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [Schemas](#schemas)
- [API](#api)
- [Recipes](#recipes)
- [Motivation (The JSON Schema Problem)](#motivation-the-json-schema-problem)
- [Objectives](#objectives)
- [Limitations](#limitations)
- [Comparisons](#comparisons)

## Introduction

Juniper is a JSON Schema generator that focuses on solving two problems:
1) Writing strict and maintainable JSON Schemas.
2) Using those enforced schemas as Typescript interfaces.

Juniper primarily supports [Draft 2020-12](https://json-schema.org/draft/2020-12/json-schema-core.html) JSON Schema, but also supports OpenAPI 3.0 as much as possible.

Juniper does not provide any JSON Schema validation. Please use a validation library such as [Ajv](https://www.npmjs.com/package/ajv) for any validation. All examples in this documentation will use Ajv.

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

For every schema exported, there is both a class and functional constructor for each schema. The class can be instantiated directly via the `new` keyword, or via the static `create` method. The functional constructor is a reference to the `create` method. All three are perfectly valid ways of creating a schema, and entirely up to you to prefer OOP vs functional programming styles.

The instance returned by all three methods will be an instance of that schema class.

```ts
import { StringSchema, stringSchema } from 'juniper';

// All methods are logically the same
const schema1 = new StringSchema({ maxLength: 10 });
const schema2 = StringSchema.create({ maxLength: 10 });
const schema3 = stringSchema({ maxLength: 10 })

console.log(schema3 instanceof StringSchema); // true
```

Juniper instances are **immutable**. That means calling an instance method does not alter the existing instance, and has no side effects. Every method that "alters" the schema will return a clone of the instance.

```ts
import { numberSchema } from 'juniper';

const schema1 = numberSchema({ type: 'integer' });
const schema2 = schema1.multipleOf(5);

console.log(schema1 === schema2); // false
console.log(schema1.toJSON()); // { type: 'integer' }
console.log(schema2.toJSON()); // { type: 'integer', multipleOf: 5 }
```

It is _highly_ recommended the Juniper module is used with Typescript. While it may provide some benefits in a JS or loosely typed environment for maintaining schemas, a significant portion of the logic resolves around generating correct types associated with each schema.

There are also many validation restrictions that are only applied in Typescript. For example:
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
The above code will fail Typescript validation for a number of reasons. However it will not necessarily fail when executed as plain Javascript. The resulting JSON Schema may be equally nonsensical.

## Schemas

Juniper exports the following Schema classes, with their provided JSON Schema/Typescript equivalent.

Juniper Class | JSON Schema | Typescript literal
---|---|---
ArraySchema | `type: 'array'` | `unknown[]`
BooleanSchema | `type: 'boolean'` | `boolean`
CustomSchema | N/A (whatever is provided) | N/A (whatever is provided)
EnumSchema | `enum: []` | N/A (Union `\|` of provided literals)
MergeSchema | N/A (compositional schema) | _initially_ `unknown` then `\|` or `&` as appropriate.
NeverSchema | `not: {}` | `never`
NullSchema | `type: 'null'` | `null`
NumberSchema | `type: 'number'` OR `type: 'integer'` | `number`
ObjectSchema | `type: 'object'` | `{}`
StringSchema | `type: 'string'` | `string`
TupleSchema | `type: 'array'` | `[unknown]`

Schemas come with a couple caveats:

* `NumberSchema` can emit type of `integer` and `number` (default), based on the `type` field. It does not impact TS typings.
* `MergeSchema` without "merging" anything can be used as a generic `unknown`. Using methods like `allOf` and `anyOf` can generate a mix of unrelated types like `number | string`.
* `TupleSchema` is a convenience wrapper around `ArraySchema` ensuring "strict" tuples. The same functionality can be achieved via raw `ArraySchema`.
* `CustomSchema` is used to break out of the Juniper environment. It's usage is discouraged, but may be the best solution when dealing with instances where some JSON Schemas + typings already exist, and for gradual adoption of Juniper.
* There is no `any` schema, as `any` is discouraged in favor of `unknown` (`MergeSchema`). If `any` is truly required, `CustomSchema` may be used (default output is "always valid" empty JSON Schema)

## API

### Helper Types

Type | Interface | Description
---|---|---
SchemaType | `SchemaType<Schema>` \| `SchemaType<JSON>` | Extracts the TS type from the class or JSON.
Schema | `Schema<number>` | Juniper Schema that describes a typescript interface. _Only_ usable for passing to rendering to JSON and occasionally as a parameter to other Juniper instances.
JSONSchema | `JSONSchema<number>` | JSON Schema object that describes the specified Typescript type
EmptyObject | `EmptyObject` | Describes an _actually empty_ object. Mostly used internally but exposed for convenience.
PatternProperties | ``PatternProperties<`abc${string}`>`` | Describes a string pattern type. See `ObjectSchema.patternProperties` for usage.

### Constructors

Every schema can be generated three ways:
* `new` Keyword - `new StringSchema()`
* static `create` method - `StringSchema.create()`
* functional constructor - `stringSchema()`

Every constructor takes a single options object, to set properties on the JSON object. Every parameter is optional, and can also be set via a method of similar name.

`stringSchema({ maxLength: 5 })` == `StringSchema.create().maxLength(5)` == `new StringSchema({}).maxLength(5)`.

Not _every_ property can be set in the constructor, and must be set via a method. This limitation is usually due to restrictions of type inference on the constructor alone.

Schema Constructors make heavy use of [Typescript Generics](https://www.typescriptlang.org/docs/handbook/2/generics.html). The usage of these generics should be seen as internal, and may break in unannounced ways in future releases. The one exception is `CustomSchema`, whose type is provided via the Generic parameter.

Juniper instances are immutable, so every method returns a _clone_ of the original instance, with the provided changes.

### Generic Schema helper methods

The following helper methods are provided for typing/exporting the JSON Schema from a Juniper instance:
* `toJSON`
  * Renders the JSON Schema document. Document should be immediately passed to a validator or serializer. The exact structure of the document is not guaranteed, and should not be modified further.
  * Options
    * `openApi30` - `boolean` - Output a JSON Schema compliant with OpenAPI 3.0. Not every property is fully supported! See implementation warnings.
    * `id` - `string` optionally provide a value to be placed in the `$id` field of the document.
    * `schema` - `boolean` Include the draft as the `$schema` property.
* `ref`
  * Returns a schema object (which can be modified further) that extends the schema via the [`$ref`](https://json-schema.org/understanding-json-schema/structuring.html#ref) property.
  * Parameters
    * `path` - `string` Path to where schema is _actually_ stored in document. Final document structure is implementation specific and not verifiable.
  * If referencing a JSON Schema entirely out of control, it is best to use the `ref` method on a `CustomSchema`. Otherwise it is designed for instances where common schemas are pulled into a reusable section, such as [OpenApi's `components`](https://swagger.io/docs/specification/components/) section.
  * Example:
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
    Note the above example is not 100% compliant with OpenAPI spec. The `nullableResource` is _merged_ with the `$ref` (allowed in Draft 2020-12 and generally supported by most resolvers). Full compliance could be achieved by manually merging with a NullSchema:
    ```ts
    const nullableResourceSchema = mergeSchema().oneOf([
        resourceSchema,
        nullSchema
    ]);
    ```
    The resulting types are identical.
* `cast`
  * Casts the instance as a schema for a specific type. Use with caution as it can only be further chained with a `toJSON` call. Possibly useful when declaring a schema for javascript-generated objects that are not explicitly enforced in JSON Schema.
  * Example:
    ```ts
    import { objectSchema } from 'juniper';

    const kindSym = Symbol.for('kind');

    const userSchema = objectSchema({
        properties: {
            id: true,
            email: true;
        },
        additionalProperties: false,
    }).cast<{
        [kindSym]: 'user';
        id: string;
        email: string;
    }>();
    ```
* `metadata`
  * Allows attaching any custom data to a JSON Schema. For example, [`x-` prefix for OpenAPI](https://swagger.io/specification/#specification-extensions).
  * Only restriction is keys cannot overlap with existing implementations. `numberSchema().metadata('maximum', 5)` is forbidden.
  * Parameters
    * Either as `(key, value)` format, or `({ key1: val1, key2: val2 })` format.

Individual schemas _may not_ expose every method, generally due to the result being nonsensical, or forbidden (e.g. `enum: []` cannot also be `nullable`).

### Generic Schema Methods/Properties
The following methods are available on every Schema:

Method Name | Constructor Parameter | Can be Unset | Changes Types
---|:---:|:---:|:---:
[title](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.1) | ✅ | ✅ | ❌
[description](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.1) | ✅ | ✅ | ❌
[default](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.2) | ✅ | ✅ | ❌
[deprecated](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.3) | ✅ | ✅ | ❌
[deprecated](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.3) | ✅ | ✅ | ❌
[example(s)](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.5) | ❌ | ❌ | ❌
[readOnly](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.4) | ✅ | ✅ | ❌
[writeOnly](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.4) | ✅ | ✅ | ❌
[allOf](https://json-schema.org/understanding-json-schema/reference/combining.html#allof) | ❌ | ❌ | ✅
[anyOf](https://json-schema.org/understanding-json-schema/reference/combining.html#anyof) | ❌ | ❌ | ✅
[oneOf](https://json-schema.org/understanding-json-schema/reference/combining.html#oneof) | ❌ | ❌ | ✅
[not](https://json-schema.org/understanding-json-schema/reference/combining.html#not) | ❌ | ❌ | ✅
[if then else](https://json-schema.org/understanding-json-schema/reference/conditionals.html#if-then-else) | ❌ | ❌ | ✅
[nullable](https://swagger.io/docs/specification/data-models/data-types/#null) | ❌ | ❌ | ✅

### Specific Schema Methods

Schema | Method Name | Constructor Parameter | Can be Unset | Changes Types | OpenAPI 3.0 Support
---|---|:---:|:---:|:---:|:---:
ArraySchema | [items](https://json-schema.org/understanding-json-schema/reference/array.html#items) | ✅ | ❌ | ✅ | ✅
ArraySchema | [maxItems](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.1) | ✅ | ✅ | ❌ | ✅
ArraySchema | [minItems](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.2) | ✅ | ✅ | ❌ | ✅
ArraySchema | [uniqueItems](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.3) | ✅ | ✅ | ❌ | ✅
ArraySchema | [contains](https://json-schema.org/understanding-json-schema/reference/array.html#contains) | ❌ | ❌ | ✅ | ❌
ArraySchema | [maxContains](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.4) | ✅ | ✅ | ❌ | ❌
ArraySchema | [minContains](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.5) | ✅ | ✅ | ❌ | ❌
ArraySchema | [(prepend)prefixItem](https://json-schema.org/understanding-json-schema/reference/array.html#tuple-validation) | ❌ | ❌ | ✅ | ❌
EnumSchema | [enum(s)](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.1.2) | ✅ | ❌ | ✅ | ✅
NumberSchema | [type](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.1.1) | ✅ | ✅ | ❌ | ✅
NumberSchema | [multipleOf](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.1) | ✅ | ❌ | ❌ | ✅
NumberSchema | [maximum](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.2) | ✅ | ✅ | ❌ | ✅
NumberSchema | [exclusiveMaximum](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.3) | ✅ | ✅ | ❌ | ✅
NumberSchema | [minimum](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.4) | ✅ | ✅ | ❌ | ✅
NumberSchema | [exclusiveMinimum](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.2.5) | ✅ | ✅ | ❌ | ✅
ObjectSchema | [properties](https://json-schema.org/understanding-json-schema/reference/object.html#properties) | ✅ | ✅ | ✅ | ✅
ObjectSchema | [maxProperties](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.5.1) | ✅ | ✅ | ❌ | ✅
ObjectSchema | [minProperties](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.5.2) | ✅ | ✅ | ❌ | ✅
ObjectSchema | [required](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.5.3) | ✅ | ✅ | ✅ | ✅
ObjectSchema | [additionalProperties](https://json-schema.org/understanding-json-schema/reference/object.html#additional-properties) | ✅ | ✅ | ✅ | ✅
ObjectSchema | [patternProperties](https://json-schema.org/understanding-json-schema/reference/object.html#pattern-properties) | ❌ | ✅ | ✅ | ❌
ObjectSchema | [dependentRequired](https://json-schema.org/understanding-json-schema/reference/conditionals.html#dependentrequired) | ❌ | ❌ | ✅ | ✅
ObjectSchema | [dependentSchemas](https://json-schema.org/understanding-json-schema/reference/conditionals.html#dependentschemas) | ❌ | ❌ | ✅ | ✅
ObjectSchema | [unevaluatedProperties](https://json-schema.org/understanding-json-schema/reference/object.html#unevaluated-properties) | ✅ | ❌ | ❌ | ❌
StringSchema | [format](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.7) | ✅ | ✅ | ❌ | ✅
StringSchema | [maxLength](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.3.1) | ✅ | ✅ | ❌ | ✅
StringSchema | [minLength](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.3.1) | ✅ | ✅ | ❌ | ✅
StringSchema | [pattern](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.3.3) | ✅ | ❌ | ❌ | ✅
StringSchema | startsWith | ❌ | ❌ | ✅ | ✅
StringSchema | endsWith | ❌ | ❌ | ✅ | ✅
StringSchema | contains | ❌ | ❌ | ✅ | ✅
StringSchema | [contentEncoding](https://json-schema.org/understanding-json-schema/reference/non_json_data.html#contentencoding) | ✅ | ✅ | ❌ | ✅
StringSchema | [contentMediaType](https://json-schema.org/understanding-json-schema/reference/non_json_data.html#contentmediatype) | ✅ | ✅ | ❌ | ✅
TupleSchema | [uniqueItems](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.3) | ✅ | ✅ | ❌ | ✅
TupleSchema | [contains](https://json-schema.org/understanding-json-schema/reference/array.html#contains) | ❌ | ❌ | ✅ | ❌
TupleSchema | [maxContains](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.4) | ✅ | ✅ | ❌ | ❌
TupleSchema | [minContains](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.4.5) | ✅ | ✅ | ❌ | ❌
TupleSchema | [(prepend)prefixItem](https://json-schema.org/understanding-json-schema/reference/array.html#tuple-validation) | ❌ | ❌ | ✅ | ❌

### Implementation Notes
* ObjectSchema.patternProperties takes advantage of the string type of the keys. However the key itself is a regular expression pattern, and cannot be interpreted directly. So the key should be wrapped with the `PatternProperties` helper type.
  * Example:
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

    // Record<`abc${string}`, unknown> & Record<`${string}xyz`, number>;
    type Output = SchemaType<typeof startsWithAbc>;
    ```
* StringSchema's `startsWith`, `endsWith`, and `contains` are just wrappers around the `pattern` property, but with special typescript handling.
* TupleSchema is simply a wrapper around ArraySchema enforcing "strict" tuples (does not allow editing `items`). It is recommended but not necessary. Every TupleSchema is an ArraySchema.
* JSON Schema interprets omitting `additionalProperties` as implied `additionalProperties=true`. The emitted typescript will only include this extra index typing when explicitly set to true.
  * Example:
    ```ts
    import { objectSchema, SchemaType } from 'juniper';

    const empty = objectSchema();
    // Actually called `EmptyObject`, see "Helper Types".
    type EmptyObject = SchemaType<typeof empty>;

    const indexed = empty.additionalProperties(true);
    // Record<string, unknown>
    type IndexedObject = SchemaType<typeof indexed>;
    ```

## Recipes

Some helpful schema recipes to get started and provide inspiration of how to proceed.

### Typescript Enum

Typescript `enums` are actually object dictionaries that sometimes have [reverse mappings](https://www.typescriptlang.org/docs/handbook/enums.html#reverse-mappings) so cannot trivially get list of all values via something like `Object.values`. The [enum-to-array](https://www.npmjs.com/package/enum-to-array) can resolve that.

```ts
import { enumToValues } from 'enum-to-array';
import { enumSchema } from 'juniper';

MyEnum {
    FOO = 'BAR',
    ABC = 123,
}

enumSchema({
    enum: enumToValues(MyEnum)
}).toJSON();
// { enum: ['BAR', 123] }
```

## Motivation (The JSON Schema Problem)

[Json Schema](https://json-schema.org/) is a powerful vocabulary for describing data formats that is both human and machine readable.

However, when it comes to generating and using these schemas, a few issues pop up:

* Strictness
  * Validation of a Json Schema is quite loose, and does not enforce sensible schemas.
  * For example:
    * ```json
      {
        "items": { "type": "number" }
      }
      ```
      _appears_ to enforce an array with number elements. But due to the omission of `"type": "array"` any non-array value will also validate successfully!
    * ```json
      {
        "type": "array",
        "items": { "type": "number" },
        "maxLength": 10
      }
      ```
      Now we have added the `array` enforcement and even required no more than 10 elements. Except that is the wrong keyword! `maxItems` enforces array length, `maxLength` is for strings.
    * ```json
      {
        "type": "object",
        "properties": {
            "foobar": { "type": "string" }
        },
        "required": ["fooBar"]
      }
      ```
      This schema object uses inconsistent case and as a result, `foobar` is never guaranteed to exist on the output! Furthermore it is unlikely data will validate at all because it is missing the `fooBar` property (which could be anything).
  * Libraries like Ajv have a `{ strict: true }` setting to help enforce this, but that only lets you know once you have already failed to write JSON Schema as expected.
  * Juniper solves this issue by strict typings on the schema generators. You must explicitly declare the type of the schema (e.g. `object` or `number`) and only the properties related to that schema may be set.
* DRY
  * Good code should be DRY ([Don't repeat yourself](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself)). However, JSON Schema itself is just JSON, it doesn't mean anything in a Typescript runtime. Manually writing Typescript interfaces to match a JSON schema (and vice versa) quickly becomes a maintenance nightmare and opens up opportunities to mistype a schema.
  * Juniper resolves this issue by generating the JSON Schema and the Typescript types at the same time. Typescript interfaces are emitted by JSON Schema attributes where possible, but does not limit schema generation due to that.
  * See [Comparisons](#comparisons) for a list of alternatives that help DRY JSON Schema generation.
* Backwards Compatibility
  * Json Schema comes in multiple "versions", often referred to as drafts. While these versions generally follow the patterns set by predecessors, some changes are breaking and are non-trivial to fix. Perhaps the most infamous is [OpenApi's `nullable` keyword over `type: 'null'`](https://swagger.io/docs/specification/data-models/data-types/#null). When generating Json Schemas for multiple environments, it can be tricky to maintain usage of the correct keywords.
  * By generating the JSON Schema dynamically, Juniper is able to adjust the outputted schema to fit the environment.
    * Presently Juniper supports Draft 2020-12 (default) and OpenAPI 3.0.

## Objectives

Juniper has the following goals for generating JSON Schema:

* JSON Schema compatibility
  * Hopefully obvious, Juniper should expose the functionality of every JSON Schema keyword.
* Strict Typing
  * As much as possible, any changes to a JSON Schema that _can_ be reflected as a TS Type should alter the emitted interface.
* Generate Strict Schemas
  * "Strictness" is defined by the [Ajv Validator](https://ajv.js.org/strict-mode.html). Any outputted JSON Schema should be able to be passed to AJV with `{ strict: true }` with no errors.
* Enforce best practice
  * JSON Schema itself has little restrictions of what a valid schema is, and even with "strict" schemas can create nonsensical schemas. Juniper is opinionated in only generating schemas that make logical sense.
  * For example `BooleanSchema` does not allow setting the `not` keyword. Given there are only at most 3 possible values (`true`, `false`, and potentially `null`) if it is desired to restrict the schema further, it is recommended to use the `EnumSchema` instead.
* Multi-draft support
  * As much as logically possible, outputted schemas should be compatible with multiple drafts.
  * For example, `if`/`then`/`else` conditionals are converted to [`anyOf` pairs](https://json-schema.org/understanding-json-schema/reference/conditionals.html#implication) when rendered with `openApi30: true`.
* Catch errors at Build time
  * Any validations enforcing schema structure should be applied at Typescript time. Code that successfully compiles to javascript should _never_ throw an error during runtime due to validation issues.

### Non-Goals
The following are non-goals for Juniper.

* Validation
  * Juniper is not a validation library. It will also not catch "impossible" schemas such as:
    ```ts
    import { stringSchema } from 'juniper';

    const neverValid = stringSchema({ minLength: 10, maxLength: 5 });
    ```
* Predictable JSON Schema
  * Juniper applies various "optimizations" to schemas in order to provide strictness, and also ensure logically correct JSON Schema. As a result, the internal structure of a schema should be treated as opaque, and only passed to a serializer (e.g. `JSON.stringify`) or a validator (e.g. an `Ajv` instance). Attempting to read/modify the resulting JSON manually may have unexpected consequences.
  * Example:
    ```ts
    import { numberSchema } from 'juniper';

    const schema = numberSchema({
        type: 'number',
        multipleOf: 6,
    })
        .nullable()
        .multipleOf(8)
        .allOf(
            numberSchema({ type: 'integer' })
        );

    /**
     * "Expected" schema:
     * {
     *   "type": "number",
     *   "multipleOf": 6,
     *   "nullable": true,
     *   "allOf": [{
     *     "type": "integer",
     *   }],
     * }
     */
    console.log(json.toJSON())
    /**
     * Actual schema:
     * {
     *   "type": "integer",
     *   "multipleOf": 24,
     *   "allOf": [{}],
     * }
     */
    ```
* Sensible Defaults
  * JSON Schema _does not_ apply any defaults to a schema that are not explicitly required. As such, properties like object's `required`, `additionalProperties` or `unevaluatedProperties` _must_ be set manually. Perhaps the one exception is `TupleSchema` which handles some values internally to ensure a strict tuple schema.
* Performance
  * While Juniper should not be a runtime bottleneck, it optimizes functionality over speed for schema generation. Schemas should (as much as possible) be generated only once, and at the start of the process.

## Limitations

Juniper tries to emit Typescript types for related JSON Schemas. These types are generally best effort, and have some limitations.

* Unions
  * Typescript does not have a way of differentiating between `oneOf` or `anyOf`. Both will use the union pipe literal `|`.
* Negation
  * The `not` keyword is not fully enforced in Typescript. The general TS equivalent `Exclude` does not enforce a specific type is not allowed.
  * For example:
    ```ts
    // Legal, although seems like it should not be.
    const notAbc: Exclude<string, 'abc'> = 'abc';
    const notAbc123: Exclude<{ abc: number }, { abc: 123 }> = { abc: 123 };
    ```
  * The general exception is enforcement that a schema cannot be null.

## Comparisons

There are many other tools available for dealing with JSON Schema in a Typescript environment. While this list is not exhaustive, it provides insight to potential alternatives and feature disparity.

* Dynamic Schema Generation
  * [TypeBox](https://www.npmjs.com/package/@sinclair/typebox)
  * [JTD for Ajv](https://ajv.js.org/json-type-definition.html)
* Javascript validation
  * [joi](https://www.npmjs.com/package/joi)
  * [zod](https://zod.dev/)
* TS -> JSON Schema
  * [typescript-json-schema](https://www.npmjs.com/package/typescript-json-schema)
  * [ts-json-schema-henerator](https://www.npmjs.com/package/ts-json-schema-generator)
* JSON Schema -> TS
  * [json-schema-to-typescript](https://www.npmjs.com/package/json-schema-to-typescript)
