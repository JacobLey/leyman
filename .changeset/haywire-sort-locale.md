---
"haywire": patch
---

`HaywireCircularDependencyError` and `HaywireSyncSupplierError` sort what they list the same way on every machine, as the other errors already did, rather than by the machine's locale. `HaywireSyncSupplierError` no longer sorts the array it is given in place.
