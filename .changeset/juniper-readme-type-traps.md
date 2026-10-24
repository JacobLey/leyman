---
"juniper": patch
---

Document the type traps in the README and JSDoc: enum values need `as const`, `required` must be an inline array, `Schema<T>` cannot be nested in builders, and `EnumSchema` has no `nullable()`. Also document `isSchema`, the tuple builder and Ajv's strict `format` error.
