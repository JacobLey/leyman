---
"juniper": minor
---

Add `ObjectSchema.extend(schema)` to add the properties and `required` of another object schema. Duplicate properties are rejected, and `additionalProperties` applies to the combined properties, so a closed object stays closed.

`required()` with no keys marks every property as required, the inverse of `partial()`.

`StringSchema.format` autocompletes the formats defined by JSON Schema and OpenAPI 3.0 (exported as `KnownFormat`), and still accepts any string.

`$defs` and `components()` are sorted by name, so output no longer depends on the order definitions are used in.
