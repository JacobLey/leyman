<div style="text-align:center">

# Why Juniper?

</div>

## The Problem

[JSON Schema](https://json-schema.org/) is a powerful vocabulary for describing data formats. It is both human and machine readable, widely supported, and forms the backbone of tools like OpenAPI. But writing and maintaining JSON Schemas by hand is surprisingly treacherous.

Here are the failure modes that motivated Juniper:

### Schemas that look correct but silently pass anything

JSON Schema validation is permissive by default. A schema that _looks_ restrictive may validate data you never intended:

```json
{
  "items": { "type": "number" }
}
```

This appears to enforce an array of numbers. But because `"type": "array"` is omitted, any non-array value also passes validation. The schema is quietly broken.

### Wrong keywords accepted without complaint

```json
{
  "type": "array",
  "items": { "type": "number" },
  "maxLength": 10
}
```

`maxLength` is a string keyword. The correct keyword for arrays is `maxItems`. Most JSON Schema validators will silently ignore the unrecognized keyword. Your constraint simply does not apply, and nothing tells you.

### Typos in property names cause invisible bugs

```json
{
  "type": "object",
  "properties": {
    "foobar": { "type": "string" }
  },
  "required": ["fooBar"]
}
```

`foobar` and `fooBar` are different keys. The `required` entry refers to a property that does not exist in `properties`. The schema will almost certainly reject everything it receives, but nothing in the tooling points to why.

Ajv's `{ strict: true }` mode catches all three of these, but only when the schema is compiled: at startup, or in a test that happens to cover it. Nothing flags the mistake while you write it.

---

## The DRY Problem

Good code avoids duplication. JSON Schema does not help with this.

JSON Schema is JSON — it has no runtime meaning in TypeScript. The standard workflow is to write a JSON Schema and then write a matching TypeScript interface separately. As schemas evolve, the two drift apart. A field added to one is forgotten in the other. A required field becomes optional in the schema but not in the type. The mismatch is invisible until runtime.

Juniper solves this by generating both the JSON Schema and the TypeScript types from a single source of truth. You define the schema once; the types are derived automatically. There is nothing to keep in sync.

---

## The Multi-Draft Problem

JSON Schema has multiple versions ("drafts"), and they are not always compatible. The most well-known breaking change is OpenAPI 3.0's `nullable` keyword, which replaces the `type: ['string', 'null']` form used in JSON Schema Draft 2020-12. Supporting both environments with a static JSON file requires either duplicating schemas or applying transformations manually.

Juniper generates schemas dynamically, which means it can emit the correct form for the target environment. Pass `openApi30: true` to `toJSON()` and Juniper handles the conversion automatically. Keywords 3.0 has no equivalent for, like `if`/`then`/`else` and `dependentRequired`, are rewritten as `anyOf` branches. The few that can't be rewritten, like `contains`, are dropped, so the 3.0 schema may accept more than the 2020-12 one.

---

## Objectives

Juniper has the following goals for generating JSON Schema:

- **JSON Schema compatibility** — Expose the functionality of every JSON Schema keyword.
- **Strict typing** — Every JSON Schema attribute that can be reflected as a TypeScript type should alter the emitted interface.
- **Generate strict schemas** — Every outputted JSON Schema should pass [Ajv's `strict: true` mode](https://ajv.js.org/strict-mode.html) without errors.
- **Enforce best practice** — Juniper is opinionated. It only generates schemas that make logical sense. For example, `BooleanSchema` does not allow setting the `not` keyword — with only two or three possible values, the appropriate tool is `EnumSchema`.
- **Multi-draft support** — Outputted schemas should be compatible with multiple drafts where possible. For example, `if`/`then`/`else` conditionals are converted to [`anyOf` pairs](https://json-schema.org/understanding-json-schema/reference/conditionals.html#implication) when rendered with `openApi30: true`.
- **Catch errors at build time** — Any validation enforcing schema structure should be applied at TypeScript compile time. Code that compiles should never throw at runtime due to schema validation errors. The one exception is definition names: two different schemas defined with the same name compile, and throw when rendered.

### Non-Goals

- **Validation** — Juniper is not a validation library. It will not catch impossible schemas like `stringSchema({ minLength: 10, maxLength: 5 })`.
- **Predictable JSON Schema output** — Juniper applies internal optimizations to ensure correctness and strictness. The exact structure of a rendered schema is not guaranteed and should be treated as opaque — pass it to a validator or serializer, do not inspect or modify it manually.
- **Sensible defaults** — JSON Schema does not apply defaults to properties that are not explicitly required. Neither does Juniper. Properties like `required`, `additionalProperties`, and `unevaluatedProperties` must be set explicitly. The one exception is `TupleSchema`, which handles some values internally to ensure a strict tuple.
- **Performance** — Juniper optimizes for correctness over speed during schema generation. Schemas should be generated once, at startup.
  - Note that _validation_ (via tools like [juniper-validator](https://www.npmjs.com/package/juniper-validator) or just plain [Ajv](https://www.npmjs.com/package/ajv)) should be incredibly fast, _because_ the generation occurs outside the critical path.

---

## Limitations

Juniper emits TypeScript types for related JSON Schemas on a best-effort basis. Some JSON Schema concepts do not map cleanly to TypeScript:

- **Unions** — TypeScript cannot distinguish between `oneOf` and `anyOf`. Both produce the union pipe `|`.
- **Negation** — The `not` keyword is not fully enforced in TypeScript. The `Exclude` utility type does not actually prevent assignment:
  ```ts
  // Legal in TypeScript, despite appearances
  const notAbc: Exclude<string, 'abc'> = 'abc';
  ```
  The general exception is nullability — `.not(nullSchema())` makes a nullable schema non-nullable, in both the JSON Schema and its type.

---

## Comparisons

There are many other tools for working with JSON Schema in TypeScript. None cover the same combination of concerns as Juniper.

### Schema builders

- [TypeBox](https://www.npmjs.com/package/typebox) — Builds JSON Schema and TypeScript types together, and ships its own validator. Because `required` is derived from which properties are optional, and every type emits its `type`, it avoids two of the problems above. But its options accept any keyword, so `Type.Array(Type.Number(), { maxLength: 10 })` compiles, and it has no OpenAPI 3.0 output.

### Validation libraries

- [zod](https://zod.dev/) — Validation first. Zod 4's built-in `z.toJSONSchema()` targets JSON Schema 2020-12, draft-07 and OpenAPI 3.0, and its schemas implement Standard JSON Schema. But refinements and transforms can't be expressed in JSON Schema, so they are dropped from the export or make it throw. The Zod schema is the source of truth; the JSON Schema is a partial view of it.
- [Valibot](https://valibot.dev/) — The same trade-off, with JSON Schema export in a separate package, `@valibot/to-json-schema`.
- [joi](https://www.npmjs.com/package/joi) — Runtime validation with its own schema format. No JSON Schema output.

### JSON Schema → TypeScript

- [json-schema-to-ts](https://www.npmjs.com/package/json-schema-to-ts) — Infers a TypeScript type from a JSON Schema written `as const`, with no runtime code. It shares Juniper's single source of truth, but the schema is plain JSON, so nothing stops `maxLength` on an array or a typo in `required`.
- [json-schema-to-typescript](https://www.npmjs.com/package/json-schema-to-typescript) — Generates TypeScript files from JSON Schema files as a build step. The schema itself is not checked either.

### TypeScript → JSON Schema

- [ts-json-schema-generator](https://www.npmjs.com/package/ts-json-schema-generator) / [typescript-json-schema](https://www.npmjs.com/package/typescript-json-schema) — Generate JSON Schema from TypeScript types as a build step. You don't write the schema directly: constraints TypeScript can't express, like `maxLength` or `pattern`, are JSDoc tags, which aren't type-checked.

### Ajv

- [`JSONSchemaType<T>`](https://ajv.js.org/guide/typescript.html) — Type-checks a hand-written schema against a TypeScript type, so a missing `type` or a typo in `required` fails to compile. But the schema and the type are written separately, and `maxLength` on an array still compiles.
- [JTD for Ajv](https://ajv.js.org/json-type-definition.html) — Uses JSON Type Definition rather than JSON Schema; not interchangeable.

Juniper's position: author the schema with full TypeScript safety, get types for free, and output valid JSON Schema for any target environment. It does not require you to choose between schema authoring and type safety — it provides both from a single definition.
