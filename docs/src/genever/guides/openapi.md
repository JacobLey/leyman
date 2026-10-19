---
description: Generate a type for every component schema of an OpenAPI 3.0 or 3.1 document, and types for its operations.
---

# OpenAPI documents

Most schemas arrive inside an OpenAPI document. Pass the document itself:

```sh
npx genever openapi.yaml -o src/api-types.ts
```

genever reads any JSON or YAML file with an `openapi` version as a document:

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

A `.yaml` or `.yml` document is read as YAML 1.2. See [YAML](/genever/reference/api#yaml).

A single OpenAPI 3.0 schema, outside a document, needs `--open-api-30` to allow `nullable`.

## Operations

A document with `paths` also gets two types for its operations, in the shape [openapi-typescript](https://openapi-ts.dev/) generates:

- `Paths`, keyed by path, then method. A method the path doesn't have is `?: never`.
- `Operations`, keyed by `operationId`. `Paths` refers to these entries, and an operation without an `operationId` is only in `Paths`.

Each operation has its `parameters` by location (`query`, `header`, `path` and `cookie`), its `requestBody`, and its `responses` by status code, each with `headers` and `content` by media type. Look types up by key:

```ts
// @noErrors
import type { Operations, Paths } from './api-types.js';

type User = Paths['/users/{id}']['get']['responses'][200]['content']['application/json'];
type NewUser = Operations['createUser']['requestBody']['content']['application/json'];
type UserQuery = Operations['getUser']['parameters']['query'];
```

- A location without parameters is `?: never`, and one whose parameters are all optional is optional. Path parameters are always required. An operation's parameters replace its path item's of the same name and location.
- `requestBody` is optional unless the body is `required`, and `?: never` without one. An optional one includes `undefined`, so look into it with `NonNullable<Operations['updateUser']['requestBody']>['content']`.
- A response without `content` has `content?: never`. `headers` has every declared header, and allows any other.
- `$ref`s to `components.parameters`, `requestBodies`, `responses` and `headers`, and to path items, are followed. Schemas are the component types, like `User`.
- Every media type is included, not only JSON. A media type without a schema is `unknown`.
- `summary`, `description` and `deprecated` become JSDoc on each operation, parameter, request body, response and header.

Component schemas keep their names, so a component called `Paths` or `Operations` makes these `Paths2` or `Operations2`. Two operations with the same `operationId` fail with a `GeneverInvalidSchemaError`.

## With Juniper

A spec built with [Juniper's `components()`](/juniper/guides/openapi) generates the same types Juniper inferred, for 3.0 and 3.1 alike. So a service can publish its spec, and a client generate matching types from it, with neither depending on the other's code.
