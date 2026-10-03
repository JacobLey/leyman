---
"haywire": patch
---

Fix `identifier()` and other class-accepting APIs rejecting classes whose private constructor takes arguments. TypeScript strips private constructor parameters from emitted declarations, so the published types only accepted private constructors with no arguments. `Constructable` is now a hand-written declaration that ships as-is.
