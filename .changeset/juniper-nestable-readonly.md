---
"juniper": patch
---

- The published type declarations type-check with `skipLibCheck: false`.
- `required`, `dependentRequired`, `examples`, `anyOf` and `oneOf` accept `readonly` arrays, so `as const` variables work.
- New `NestableSchema<T>` type: annotate a schema with it, and it can still be passed to `properties`, `arraySchema` and other builders.
