---
"juniper": minor
---

`toJSON({ openApi30: true })` and `components(schemas, { openApi30: true })` return the new `OpenApi30JsonSchema` type, with no boolean sub-schemas and a single `type`, so the output assigns to OpenAPI libraries' 3.0 schema types (e.g. openapi3-ts's `oas30.SchemaObject`) without a cast. Other output is still a `JsonSchema`.
