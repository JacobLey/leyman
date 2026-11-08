---
'juniper-arbitrary': patch
---

Building the first arbitrary with a plain string now takes about 20 ms instead of half a second. Strings were generated with fast-check's `binary` unit, which builds a lookup of all 1.1 million code points the first time it is used; juniper-arbitrary now uses its own unit that generates and shrinks the same values without one.
