---
"juniper": patch
---

Fix the README's Ajv example to import `{ Ajv2020 }`, which type-checks under NodeNext, and compile in strict mode. Note that `format` is emitted unchecked, so schemas using it need a validator that supports the formats they use.
