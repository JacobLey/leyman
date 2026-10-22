---
"genever": minor
---

`GeneverLoadError` has a `referencedFrom`: the URI of the file or URL with the `$ref` that needed it, which its `pointer` is in. A failure to load something another loaded file references now names that file in its message.
