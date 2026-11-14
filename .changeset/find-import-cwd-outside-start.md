---
"find-import": patch
---

`findImport` returns `null` when `cwd` is not inside `startAt`, as documented. It used to still search `cwd` itself.
