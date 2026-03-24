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

Libraries like Ajv have a `{ strict: true }` mode to catch some of these issues — but only after you run your validator. By then you have already shipped the broken schema.

---

## The DRY Problem

Good code avoids duplication. JSON Schema does not help with this.

JSON Schema is JSON — it has no runtime meaning in TypeScript. The standard workflow is to write a JSON Schema and then write a matching TypeScript interface separately. As schemas evolve, the two drift apart. A field added to one is forgotten in the other. A required field becomes optional in the schema but not in the type. The mismatch is invisible until runtime.

Juniper solves this by generating both the JSON Schema and the TypeScript types from a single source of truth. You define the schema once; the types are derived automatically. There is nothing to keep in sync.

---

## The Multi-Draft Problem

JSON Schema has multiple versions ("drafts"), and they are not always compatible. The most well-known breaking change is OpenAPI 3.0's `nullable` keyword, which replaces the `type: ['string', 'null']` form used in JSON Schema Draft 2020-12. Supporting both environments with a static JSON file requires either duplicating schemas or applying transformations manually.

Juniper generates schemas dynamically, which means it can emit the correct form for the target environment. Pass `openApi30: true` to `toJSON()` and Juniper handles the conversion automatically.

---

## Objectives

Juniper has the following goals for generating JSON Schema:

- **JSON Schema compatibility** — Expose the functionality of every JSON Schema keyword.
- **Strict typing** — Every JSON Schema attribute that can be reflected as a TypeScript type should alter the emitted interface.
- **Generate strict schemas** — Every outputted JSON Schema should pass [Ajv's `strict: true` mode](https://ajv.js.org/strict-mode.html) without errors.
- **Enforce best practice** — Juniper is opinionated. It only generates schemas that make logical sense. For example, `BooleanSchema` does not allow setting the `not` keyword — with only two or three possible values, the appropriate tool is `EnumSchema`.
- **Multi-draft support** — Outputted schemas should be compatible with multiple drafts where possible. For example, `if`/`then`/`else` conditionals are converted to [`anyOf` pairs](https://json-schema.org/understanding-json-schema/reference/conditionals.html#implication) when rendered with `openApi30: true`.
- **Catch errors at build time** — Any validation enforcing schema structure should be applied at TypeScript compile time. Code that compiles should never throw at runtime due to schema validation errors.

### Non-Goals

- **Validation** — Juniper is not a validation library. It will not catch impossible schemas like `stringSchema({ minLength: 10, maxLength: 5 })`.
- **Predictable JSON Schema output** — Juniper applies internal optimizations to ensure correctness and strictness. The exact structure of a rendered schema is not guaranteed and should be treated as opaque — pass it to a validator or serializer, do not inspect or modify it manually.
- **Sensible defaults** — JSON Schema does not apply defaults to properties that are not explicitly required. Neither does Juniper. Properties like `required`, `additionalProperties`, and `unevaluatedProperties` must be set explicitly. The one exception is `TupleSchema`, which handles some values internally to ensure a strict tuple.
- **Performance** — Juniper optimizes for correctness over speed during schema generation. Schemas should be generated once, at startup.
  - Note that _validation_ (via tools like [juniper-validator](https://www.npmjs.com/package/juniper-validator) or just plain [AJV](https://www.npmjs.com/package/ajv) should be incredibly fast, _because_ the generation occurs outside the critical path.)

---

## Limitations

Juniper emits TypeScript types for related JSON Schemas on a best-effort basis. Some JSON Schema concepts do not map cleanly to TypeScript:

- **Unions** — TypeScript cannot distinguish between `oneOf` and `anyOf`. Both produce the union pipe `|`.
- **Negation** — The `not` keyword is not fully enforced in TypeScript. The `Exclude` utility type does not actually prevent assignment:
  ```ts
  // Legal in TypeScript, despite appearances
  const notAbc: Exclude<string, 'abc'> = 'abc';
  ```
  The general exception is nullability — Juniper can enforce that a schema cannot be null.

---

## Comparisons

There are many other tools available for dealing with JSON Schema in a TypeScript environment. None cover the same combination of concerns as Juniper.

### Dynamic Schema Generation (similar approach)

- [TypeBox](https://www.npmjs.com/package/@sinclair/typebox) — Generates JSON Schema and TypeScript types together. More focused on JSON Schema compatibility than strict schema enforcement.
- [JTD for Ajv](https://ajv.js.org/json-type-definition.html) — Uses JSON Type Definition rather than JSON Schema; not interchangeable.

### JavaScript Validation Libraries

- [joi](https://www.npmjs.com/package/joi) — Runtime validation with its own schema format. Does not emit standard JSON Schema.
- [zod](https://zod.dev/) — TypeScript-first validation. Can export JSON Schema via plugins, but validation is the primary concern, not schema generation.

### TypeScript → JSON Schema

- [typescript-json-schema](https://www.npmjs.com/package/typescript-json-schema) — Generates JSON Schema from TypeScript type annotations. Works from the TS side outward; does not let you author the schema directly.
- [ts-json-schema-generator](https://www.npmjs.com/package/ts-json-schema-generator) — Similar to above; parses TypeScript source to emit schema.

### JSON Schema → TypeScript

- [json-schema-to-typescript](https://www.npmjs.com/package/json-schema-to-typescript) — Generates TypeScript interfaces from existing JSON Schema files. Works from the schema side inward; does not prevent you from writing a bad schema.

Juniper's position: author the schema with full TypeScript safety, get types for free, and output valid JSON Schema for any target environment. It does not require you to choose between schema authoring and type safety — it provides both from a single definition.
