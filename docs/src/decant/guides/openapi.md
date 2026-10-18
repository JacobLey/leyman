---
description: Generate a type for every component schema of an OpenAPI 3.0 or 3.1 document.
---

# OpenAPI documents

Most schemas arrive inside an OpenAPI document. Pass the document itself:

```sh
npx decant openapi.yaml -o src/api-types.ts
```

decant reads any JSON or YAML file with an `openapi` version as a document:

- Every `components.schemas` entry becomes an exported type, named after its key. There is no root type, so `--name` is not used.
- A `$ref` to `#/components/schemas/User` is the type `User`.
- The version decides the dialect: OpenAPI 3.0 schemas may use `nullable`, and OpenAPI 3.1 schemas are JSON Schema 2020-12.
- OpenAPI's own keywords, `discriminator`, `xml`, `externalDocs` and `example`, are allowed in strict mode, and don't change the type. `example` is written as a JSDoc `@example`.

```json
{
  "openapi": "3.0.3",
  "info": { "title": "Users", "version": "1.0.0" },
  "paths": {},
  "components": {
    "schemas": {
      "User": {
        "type": "object",
        "properties": {
          "name": { "type": "string", "nullable": true },
          "home": { "$ref": "#/components/schemas/Address" }
        },
        "required": ["name"]
      },
      "Address": {
        "type": "object",
        "properties": { "city": { "type": "string" } }
      }
    }
  }
}
```

```ts
export type Address = {
    city?: string;
};

export type User = {
    name: string | null;
    home?: Address;
};
```

A `.yaml` or `.yml` document is read as YAML 1.2. See [YAML](/decant/reference/api#yaml).

A single OpenAPI 3.0 schema, outside a document, needs `--open-api-30` to allow `nullable`.

## With Juniper

A spec built with [Juniper's `components()`](/juniper/guides/openapi) decants to the same types Juniper inferred, for 3.0 and 3.1 alike. So a service can publish its spec, and a client generate matching types from it, with neither depending on the other's code.
