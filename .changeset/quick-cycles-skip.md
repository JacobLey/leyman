---
"@leyman/eslint-config": patch
---

`import-x/no-cycle` no longer follows imports into installed packages (`ignoreExternal`), which can't import a package's own files and so can't be part of a cycle. Following them parsed everything they import: linting a package that imports TypeScript took 15 s and 2.9 GB for 17 files, now 6 s and 760 MB. Workspace packages are still followed.
