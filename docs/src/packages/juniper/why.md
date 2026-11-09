---
description: The problems Juniper solves, its design goals and non-goals, and how it compares to alternatives.
---

# Why Juniper?

## The Problem

[JSON Schema](https://json-schema.org/) is a powerful vocabulary for describing data formats that is both human and machine readable. It is widely supported, and it is the basis of tools like OpenAPI.

However, when it comes to writing and using these schemas, a few issues pop up.

### A missing `type`

Validation of a JSON Schema is quite loose, and does not enforce sensible schemas. For example:

```json
{
  "items": { "type": "number" }
}
```

This _appears_ to enforce an array with number elements. But because `"type": "array"` is omitted, any non-array value will also validate successfully.

### Keywords for the wrong type

```json
{
  "type": "array",
  "items": { "type": "number" },
  "maxLength": 10
}
```

Now the schema enforces an array, and even requires no more than 10 elements. Except that is the wrong keyword. `maxItems` limits the length of an array, and `maxLength` is for strings. Most JSON Schema validators silently ignore a keyword that doesn't apply, so the limit is never checked.

### `required` keys that don't match `properties`

```json
{
  "type": "object",
  "properties": {
    "foobar": { "type": "string" }
  },
  "required": ["fooBar"]
}
```

This schema uses inconsistent case, and as a result `foobar` is never guaranteed to exist on the output. Data is also unlikely to validate at all, because it has to have a `fooBar` property (which could be anything), and nothing in the tooling points to why it fails.

Ajv's `{ strict: true }` setting catches all three of these, but only once the schema is compiled (at startup, or in a test that happens to cover it). By then the schema has already been written wrong, and nothing flagged it while you wrote it.

Juniper solves this with strict typings on the schema builders. You explicitly declare the type of each schema (e.g. `object` or `number`), and only the keywords that apply to that type can be set.

## The DRY Problem

Good code should be DRY ([Don't repeat yourself](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself)). However, a JSON Schema is just JSON, and it doesn't mean anything to TypeScript. The usual workflow is to write a JSON Schema, and then write a matching TypeScript interface separately. Keeping the two in sync by hand quickly becomes a maintenance nightmare. A field added to one is forgotten in the other, or a required field becomes optional in the schema but not in the type, and the mismatch isn't noticed until runtime.

Juniper resolves this by generating the JSON Schema and the TypeScript type at the same time, from one definition, so there is nothing to keep in sync. Types are inferred from the JSON Schema keywords where possible, but schema generation isn't limited to what TypeScript can express.

## The Multi-Draft Problem

JSON Schema comes in multiple versions, often called "drafts". Each generally follows the patterns set by the ones before it, but some changes are breaking and are non-trivial to fix. Perhaps the most infamous is OpenAPI 3.0's `nullable` keyword, which it uses instead of the `type: ['string', 'null']` form of JSON Schema Draft 2020-12. When the same schemas are needed in both environments, a static JSON file means either duplicating schemas or applying transformations by hand.

By generating the JSON Schema dynamically, Juniper can adjust the output to fit the environment. Pass `openApi30: true` to `toJSON()`, and Juniper emits the OpenAPI 3.0 form. Keywords 3.0 has no equivalent for, like `if`/`then`/`else` and `dependentRequired`, are rewritten as `anyOf` branches. The few that can't be rewritten, like `contains`, are dropped, so the 3.0 schema may accept more than the 2020-12 one.

## Objectives

Juniper has the following goals for generating JSON Schema:

- It should expose the functionality of every JSON Schema keyword.
- Every JSON Schema keyword that can be reflected as a TypeScript type should change the inferred type.
- Every JSON Schema it outputs should pass [Ajv's `strict: true` mode](https://ajv.js.org/strict-mode.html) without errors.
- It should only generate schemas that make logical sense, so it is opinionated about best practice. For example, `BooleanSchema` does not allow setting the `not` keyword. A boolean schema has only two or three possible values, so `EnumSchema` is the better way to restrict it.
- Outputted schemas should be compatible with multiple drafts where possible. For example, `if`/`then`/`else` conditionals are converted to [`anyOf` pairs](https://json-schema.org/understanding-json-schema/reference/conditionals.html#implication) when rendered with `openApi30: true`.
- Mistakes in a schema's structure should be caught when TypeScript compiles, so code that compiles doesn't throw at runtime because of them. The one exception is definition names. Two different schemas defined with the same name compile, and throw when rendered.

### Non-Goals

- Juniper is not a validation library. It will not catch impossible schemas like `stringSchema({ minLength: 10, maxLength: 5 })` either.
- The rendered JSON Schema isn't meant to be predictable. Juniper applies internal optimizations to keep schemas correct and strict, so the exact structure of the output is not guaranteed. Treat it as opaque, and pass it to a validator or serializer rather than inspecting or modifying it by hand.
- Juniper doesn't apply sensible defaults. JSON Schema does not apply defaults to properties that are not explicitly required, and neither does Juniper, so keywords like `required`, `additionalProperties` and `unevaluatedProperties` must be set explicitly. The one exception is `TupleSchema`, which handles some values internally to ensure a strict tuple.
- Juniper favors correctness over speed when generating schemas, so schemas should be generated once, at startup.
  - _Validation_ (with [juniper-validator](https://www.npmjs.com/package/juniper-validator) or just plain [Ajv](https://www.npmjs.com/package/ajv)) should still be very fast, _because_ the generation happens outside the critical path.

## Limitations

Juniper's TypeScript types for a schema are best effort, and some JSON Schema concepts don't map cleanly to TypeScript:

- TypeScript cannot distinguish between `oneOf` and `anyOf`, so both produce a union (`|`).
- The `not` keyword is not fully enforced in TypeScript, because the `Exclude` utility type doesn't actually prevent assignment:

  ```ts
  // Legal in TypeScript, despite appearances
  const notAbc: Exclude<string, 'abc'> = 'abc';
  ```

  The general exception is nullability. `.not(nullSchema())` makes a nullable schema non-nullable, in both the JSON Schema and its type.

## Comparisons

There are many other tools for working with JSON Schema in TypeScript. This list is not exhaustive, but it shows the main alternatives and how they differ from Juniper.

### Schema builders

- [TypeBox](https://www.npmjs.com/package/typebox) builds JSON Schema and TypeScript types together, and ships its own validator. Because `required` is derived from which properties are optional, and every type emits its `type`, it avoids two of the problems above. But its options accept any keyword, so `Type.Array(Type.Number(), { maxLength: 10 })` compiles, and it has no OpenAPI 3.0 output.

### Validation libraries

- [zod](https://zod.dev/) is a validation library first. Zod 4's built-in `z.toJSONSchema()` targets JSON Schema 2020-12, draft-07 and OpenAPI 3.0, and its schemas implement Standard JSON Schema. But refinements and transforms can't be expressed in JSON Schema, so they are dropped from the export or make it throw. The Zod schema is the source of truth, and the JSON Schema is a partial view of it.
- [Valibot](https://valibot.dev/) makes the same trade-off, with its JSON Schema export in a separate package, `@valibot/to-json-schema`.
- [joi](https://www.npmjs.com/package/joi) validates at runtime with its own schema format, and has no JSON Schema output.

### JSON Schema → TypeScript

- [json-schema-to-ts](https://www.npmjs.com/package/json-schema-to-ts) infers a TypeScript type from a JSON Schema written `as const`, with no runtime code. Like Juniper, the schema is the single source of truth, but it is plain JSON, so nothing stops `maxLength` on an array or a typo in `required`.
- [json-schema-to-typescript](https://www.npmjs.com/package/json-schema-to-typescript) generates TypeScript files from JSON Schema files as a build step. The schema itself is not checked either.

### TypeScript → JSON Schema

- [ts-json-schema-generator](https://www.npmjs.com/package/ts-json-schema-generator) and [typescript-json-schema](https://www.npmjs.com/package/typescript-json-schema) generate JSON Schema from TypeScript types as a build step. You don't write the schema directly, and constraints TypeScript can't express, like `maxLength` or `pattern`, are written as JSDoc tags, which aren't type-checked.

### Ajv

- [`JSONSchemaType<T>`](https://ajv.js.org/guide/typescript.html) type-checks a hand-written schema against a TypeScript type, so a missing `type` or a typo in `required` fails to compile. But the schema and the type are written separately, and `maxLength` on an array still compiles.
- [JTD for Ajv](https://ajv.js.org/json-type-definition.html) uses JSON Type Definition rather than JSON Schema, so the two aren't interchangeable.
