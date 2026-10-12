---
"haywire": patch
---

Eager values are created first however deep they are in the dependency graph. Previously an async `eagerRequestScope` value more than one dependency away from the requested value, or reached only through a propagating supplier or deferred dependency, was passed to its dependent as an unresolved `Promise` (or rejected with `HaywireInstanceOfResponseError` for a class). Likewise an eager singleton reached through another binding was not always created before the eager singletons that depend on it.

A supplier that does not propagate scope no longer creates eager request values in the request that receives it, since its own requests create them.
