---
"haywire": patch
---

A `.supplier()` dependency on an instance already created earlier in the same chain of deferred dependencies receives a supplier, as typed, rather than the instance itself. For example a singleton `A` with a deferred dependency on `B`, where `B` depends on `identifier(A).supplier()`.
