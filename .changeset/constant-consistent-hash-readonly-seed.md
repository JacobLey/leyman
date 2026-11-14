---
"constant-consistent-hash": patch
---

Type `ConsistentHashOptions.seed` as `readonly`, since it is only read, so a readonly options object is accepted where a mutable type was expected.
