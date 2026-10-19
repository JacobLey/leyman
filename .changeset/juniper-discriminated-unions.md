---
"juniper": minor
---

`ObjectSchema.oneOf(schemas, { discriminator })` declares a discriminated union. Every branch must require the property as a single, unique string value (checked at compile time), and the output gets OpenAPI's `discriminator` keyword.
