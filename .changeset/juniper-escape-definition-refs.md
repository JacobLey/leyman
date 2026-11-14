---
"juniper": patch
---

A definition's `$ref` escapes its name as a JSON Pointer URI fragment (RFC 6901 §6): `~` is `~0`, `/` is `~1`, and characters a URI fragment can't hold are percent-encoded. `.define('a/b')` used to emit `#/$defs/a/b`, which no validator resolves to `$defs["a/b"]`; it is now `#/$defs/a~1b`. `serializeSpec` recognizes such a definition placed under its own name in `components.schemas`.
