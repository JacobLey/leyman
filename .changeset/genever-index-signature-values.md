---
'genever': minor
---

Include the types of `properties` and `patternProperties` in the index signature from a typed `additionalProperties`. `{ a: string } & Record<string, number>` had no values, since `a` would have to be both. It is now `{ a: string } & Record<string, number | string>`, the same as Juniper infers, so undeclared keys read as `number | string`.
