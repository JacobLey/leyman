---
"haywire": patch
---

Document the order of a list's elements, which was always kept: the order their bindings were added, with `mergeModule(other)` putting `other`'s bindings after the module's, and a container factory's `bindInstance()` elements after the module's.
