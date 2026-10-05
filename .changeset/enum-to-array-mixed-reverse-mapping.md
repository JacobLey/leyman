---
"enum-to-array": patch
---

Stop dropping string members whose value is the name of a numeric member (e.g. `enum E { B = 1, A = 'B' }` now returns both `B` and `A`).
