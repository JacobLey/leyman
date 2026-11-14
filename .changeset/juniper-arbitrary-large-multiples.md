---
"juniper-arbitrary": patch
---

Generate numbers past the safe integers when a schema's bounds or `multipleOf` call for them, such as `{ type: 'integer', minimum: 2 ** 60 }` or `{ multipleOf: 1e20, minimum: 1e20 }`, instead of throwing `UnsatisfiableSchemaError`. Multiples stay exact products of the step where the bounds allow. A tiny bound next to a large step no longer produces values outside it.
