---
"barrelify": patch
---

Use Node's `findPackageJSON` to determine module type instead of `find-import`. A malformed nearest `package.json` now errors rather than silently falling back to a parent `package.json`
