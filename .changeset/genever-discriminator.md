---
"genever": minor
---

`discriminator` is accepted in plain JSON Schema too (Juniper emits it for discriminated unions), and `type: "object"` next to a `oneOf` of objects no longer adds a redundant `Record<string, unknown> &` to the type.
