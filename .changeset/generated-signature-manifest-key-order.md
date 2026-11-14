---
"generated-signature": patch
---

`serializeManifest` writes paths and inputs in UTF-16 code unit order, as the Go implementation does. Integer-like keys such as `9` and `10` came first, in numeric order, and an entry given with `inputs` before its `hash` was written in that order.
