---
description: Generate TypeScript types from JSON Schema files and OpenAPI documents, with strict schema checks and the same types Juniper infers.
---

# genever

<ProjectHeader />

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

Run `npx genever user.json --name User`, and it writes `user.ts`:

```ts
export type User = {
    /**
     * @pattern "^usr_"
     */
    id: `usr_${string}`;
    /**
     * @minItems 2
     */
    point?: [number, number];
    /**
     * @minItems 1
     */
    tags?: [string, ...string[]];
};
```

Commit the result, and run `genever --ci` in CI to fail when it is out of date.

**[Get started →](/packages/genever/getting-started)**

## Features

- **Types that match the schema**: tuples, `oneOf` unions that narrow, `^prefix` patterns as template literals, closed `patternProperties`, recursive `$defs`, `if`/`then`/`else` and `minItems` all become precise types, not `any` or `unknown[]`. See [Type mapping](/packages/genever/reference/types).
- **Round-trips Juniper**: a schema built with [Juniper](/packages/juniper/), serialized and read back, gives the same type Juniper inferred. See [Juniper round trip](/packages/genever/guides/juniper-round-trip).
- **Strict by default**: unknown keywords, keywords that don't apply to the type, undeclared `required` properties and contradictions like `minLength` over `maxLength` fail generation. Without strict mode, types follow exactly what a validator accepts. See [Strict mode](/packages/genever/guides/strict-mode).
- **One file from many**: `$ref`s to other files and URLs are loaded and generated into the same output, with `$id` and `$anchor` resolved as the spec says. See [References to other files](/packages/genever/guides/references).
- **OpenAPI documents**: every `components.schemas` entry of an OpenAPI 3.0 or 3.1 document becomes a type, and its operations become `Paths` and `Operations` types, shaped like openapi-typescript's. See [OpenAPI documents](/packages/genever/guides/openapi).
- **Types only**: the output is plain TypeScript, with no runtime dependency.

## Compared to

Each tool is given the same documents every night, with its type checked against valid values, invalid values and reads. See the [comparison](/packages/genever/comparison) for the latest report.

Inspected by hand on 2026-11-02, at the versions named:

- [json-schema-to-typescript](https://www.npmjs.com/package/json-schema-to-typescript) 16.0.0 turns 2020-12 tuples into `never[]`, types every `pattern` as `string`, and opens objects with `patternProperties` to any key.
- [quicktype](https://www.npmjs.com/package/quicktype) 26.0.0 merges `oneOf` objects into one type with optional fields.
- [json-schema-to-zod](https://www.npmjs.com/package/json-schema-to-zod) 2.8.1 generates a validator, but every `$ref` becomes `z.any()`.
- [json-schema-to-ts](https://www.npmjs.com/package/json-schema-to-ts) 3.1.1 and [TypeBox](https://www.npmjs.com/package/typebox) 1.4.3 infer types inside TypeScript, so the schema has to be pasted in `as const`. An imported `.json` file is a type error and `unknown` in json-schema-to-ts, and in TypeBox an object whose properties are all optional and `unknown`.

## Related

<ProjectRelated />
