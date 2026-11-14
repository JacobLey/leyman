---
"@leyman/nx-plugin": patch
---

`dependency-files` hashes a dependency's root `*.sql` files, so a schema a package exports for its dependents to load (for example with `import.meta.resolve`) invalidates their cached results when it changes.
