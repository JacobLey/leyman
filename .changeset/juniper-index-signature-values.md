---
'juniper': minor
---

Include the types of `properties` and `patternProperties` in the index signature from a typed `additionalProperties`. `{ properties: { a: stringSchema() }, additionalProperties: numberSchema() }` was `{ a?: string } & Record<string, number>`, which no object with `a` could satisfy and read `a` as `never`. It now accepts what the schema accepts, and undeclared keys read as `number | string`.
