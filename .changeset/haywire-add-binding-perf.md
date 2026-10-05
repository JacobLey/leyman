---
"haywire": patch
---

Faster type-checking of large modules built with `addBinding()`. `addBinding()`, `replaceBinding()` and `createModule()` no longer recompute the base ids of every existing output to validate the incoming binding's dependencies, cutting check time by about a quarter to a third for a 200-binding module.
