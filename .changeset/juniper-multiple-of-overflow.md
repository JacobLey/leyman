---
"juniper": patch
---

Integer `multipleOf` values are no longer merged into an inexact least common multiple when it would be above `Number.MAX_SAFE_INTEGER`. They are kept separate in `allOf`, like non-integer values.
