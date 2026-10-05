---
"juniper": minor
---

Add `schema.define(name)` for reusable definitions. A defined schema is emitted as a `$ref` wherever it is used, and `toJSON()` adds every definition it references to `$defs`, so references never point at a missing definition. Derived schemas keep the reference for annotations and `nullable()`, and are emitted inline otherwise. Add `components(schemas, options)` to collect definitions for OpenAPI's `components.schemas`, and a `definitionsPath` option to `toJSON`.

Add `defineRecursive<T>(name, self => schema)` for schemas that reference themselves, such as trees or comment threads. The type is declared explicitly and the built schema is checked against it. `self` is emitted as a `$ref` to the definition, and supports `nullable()` and annotations.

Fixes:
- A `.ref()` schema nested inside another schema (e.g. as a property) threw `this.getDefaultValues is not a function` when serialized.
- OpenAPI 3.0 output used `true`/`false` as property schemas, which OpenAPI 3.0 does not allow. They are now `{}` and `{ not: {} }`.

`JsonSchema['type']` is now typed as the JSON Schema type names (exported as `JsonSchemaType`) rather than `string`.
