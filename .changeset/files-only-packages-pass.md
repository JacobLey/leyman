---
"@leyman/check-package": minor
---

A package with no entry point (no `main`, `exports`, `bin`, `module`, `types` or `typings`, and no root `index.js`) is checked as files only: its published files and publint. Are The Types Wrong, the declarations check, `@types/node` and `--floor-tsconfig` are skipped, and `engines.node` is optional, though a floor it names must still be supported by its runtime dependencies. `checkPackage()` returns `filesOnly` to say so.
