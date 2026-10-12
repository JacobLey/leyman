---
"juniper": patch
---

`multipleOf` values above `Number.MAX_SAFE_INTEGER` are kept as separate `allOf` entries, rather than merged with integer multiples into a least common multiple that a number can't represent exactly.
