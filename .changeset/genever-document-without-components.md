---
'genever': patch
---

An OpenAPI document without `components` can refer to schemas in other files: they're embedded in a new `components.schemas`. They were put in `$defs`, which a document's references don't resolve to, so generating failed as "Only references within the same document are supported".
