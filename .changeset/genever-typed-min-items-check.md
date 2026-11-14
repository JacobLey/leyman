---
"genever": patch
---

`typedMinItems` (and `--typed-min-items`) must be a non-negative integer, and anything else throws a `TypeError` saying so. `NaN` or `-1` used to turn typed `minItems` off without a word.
