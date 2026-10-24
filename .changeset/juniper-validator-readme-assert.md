---
"juniper-validator": patch
---

Fix the README example so it compiles: `assert` only narrows on a validator annotated with `JuniperValidator<T>` or `AssertionType`. Also document the peer dependency, Ajv's first-error behaviour and the Standard JSON Schema targets.
