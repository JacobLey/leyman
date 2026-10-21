---
"juniper": patch
---

With `openApi30`, an enum schema with no values outputs `not: {}` instead of `enum: []`, which OpenAPI 3.0 does not allow. Both match nothing.
