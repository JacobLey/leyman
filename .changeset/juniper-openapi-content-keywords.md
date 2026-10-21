---
"juniper": patch
---

With `openApi30`, string schemas no longer output `contentEncoding` or `contentMediaType`, which OpenAPI 3.0 does not define. Use `format('byte')` or `format('binary')` for OpenAPI 3.0.
