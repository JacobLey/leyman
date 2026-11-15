# @leyman/check-package

## 0.2.0

### Minor Changes

- 036748d: A package with no entry point (no `main`, `exports`, `bin`, `module`, `types` or `typings`, and no root `index.js`) is checked as files only: its published files and publint. Are The Types Wrong, the declarations check, `@types/node` and `--floor-tsconfig` are skipped, and `engines.node` is optional, though a floor it names must still be supported by its runtime dependencies. `checkPackage()` returns `filesOnly` to say so.

### Patch Changes

- 2fa29d4: Order the support floor and published files problems by UTF-16 code unit rather than English collation, so the order is the same everywhere (`Zeta` before `alpha`, `a-b` before `a_b`).
- d09f6d5: Accept a package in a directory of the workspace root whose name starts with `..` (such as `..data`), which was rejected as outside the root.
- 515913c: Follow Git when `.gitignore` files disagree: the deepest one with a matching rule decides, so a package's `.gitignore` can re-include (`!keep`) a path one above it ignores, and the published files check then reports it.
- d59b3b9: Throw a `CheckPackageTscError` when `tsc` can't be run (it isn't at the `--tsc` path, prints no version, crashes, or is killed) instead of reporting no declaration problems.
- Updated dependencies [61f7f7d]
  - parse-cwd@2.1.3

## 0.1.1

### Patch Changes

- 9c82c6d: Rewrite the README (and WHY file, where there is one) to introduce the problem before the package, in plainer prose.
- Updated dependencies [9e82d20]
  - entry-script@4.2.2
  - parse-cwd@2.1.2

## 0.1.0

### Minor Changes

- d836bd1: First release: checks a package exactly as it would be published, with publint, Are The Types Wrong, a strict typecheck of its declarations, its Node.js support floor and an allow-list of published files. A CLI (`check-package`) and `checkPackage()`. Supports Node.js 22.12 and newer.
