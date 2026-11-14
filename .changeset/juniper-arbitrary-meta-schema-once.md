---
"juniper-arbitrary": patch
---

`makeArbitrary` no longer compiles the JSON Schema meta-schemas on every call, which made each call about 3 ms slower than compiling the schema itself. Schemas the meta-schema rejects still throw the same `UnsupportedSchemaError`.
