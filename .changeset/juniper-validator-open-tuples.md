---
"juniper-validator": patch
---

`makeValidator()` no longer throws on open tuples (`arraySchema().prefixItem(...)`). Ajv's `strictTuples` check is now off by default, since it rejects them; pass `strictTuples: true` to turn it back on. Every other strict mode check still applies.
