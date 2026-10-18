---
description: Generate TypeScript types from JSON Schema files and OpenAPI documents, with strict schema checks and the same types Juniper infers.
---

# decant

Generate TypeScript types from a JSON Schema file, or the schemas of an OpenAPI document, with strict checks of the schema itself.

Point it at a schema:

```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "pattern": "^usr_" },
    "point": {
      "type": "array",
      "prefixItems": [{ "type": "number" }, { "type": "number" }],
      "items": false,
      "minItems": 2
    },
    "tags": { "type": "array", "items": { "type": "string" }, "minItems": 1 }
  },
  "required": ["id"]
}
```

Run `npx decant user.json --name User`, and it writes `user.ts`:

```ts
export type User = {
    id: `usr_${string}`;
    point?: [number, number];
    tags?: [string, ...string[]];
};
```

Commit the result, and run `decant --ci` in CI to fail when it is out of date.

**[Get started →](/decant/getting-started)**

## Features

- **Types that match the schema**: tuples, `oneOf` unions that narrow, `^prefix` patterns as template literals, closed `patternProperties`, recursive `$defs`, `if`/`then`/`else` and `minItems` all become precise types, not `any` or `unknown[]`. See [Type mapping](/decant/reference/types).
- **Round-trips Juniper**: a schema built with [Juniper](/juniper/), serialized and read back, gives the same type Juniper inferred. See [Juniper round trip](/decant/guides/juniper-round-trip).
- **Strict by default**: unknown keywords, keywords that don't apply to the type, undeclared `required` properties and contradictions like `minLength` over `maxLength` fail generation. Without strict mode, types follow exactly what a validator accepts. See [Strict mode](/decant/guides/strict-mode).
- **OpenAPI documents**: every `components.schemas` entry of an OpenAPI 3.0 or 3.1 document becomes a type. See [OpenAPI documents](/decant/guides/openapi).
- **Types only**: the output is plain TypeScript, with no runtime dependency.

## Compared to

Each tool was given the same schema, built with Juniper, and its type checked against 21 valid and invalid values. decant passed all 21; the others passed 12 to 16. See [Why decant](/decant/why#compared-to-alternatives).

- [json-schema-to-typescript](https://www.npmjs.com/package/json-schema-to-typescript) turns 2020-12 tuples into `never[]`, types every `pattern` as `string`, and opens objects with `patternProperties` to any key.
- [quicktype](https://www.npmjs.com/package/quicktype) merges `oneOf` objects into one type with optional fields.
- [json-schema-to-zod](https://www.npmjs.com/package/json-schema-to-zod) generates a validator, but every `$ref` becomes `z.any()`.
- [json-schema-to-ts](https://www.npmjs.com/package/json-schema-to-ts) and TypeBox infer types inside TypeScript, so the schema has to be pasted in `as const`. An imported `.json` file widens to `unknown`.
