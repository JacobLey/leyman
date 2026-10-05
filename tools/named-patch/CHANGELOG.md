# named-patch

## 2.0.1

### Patch Changes

- b188e25: Patched methods expose the original method's own properties (e.g. static helpers), reading and writing through to the original, as their `PatchableInterface<T>` type already promised.
- 15f5262: Fix README links that were broken on npm: relative links (such as WHY files and sibling packages) are now absolute, table-of-contents anchors match their headings, LICENSE badges point at the right path, and `repository` now names the package's directory in the monorepo.

## 2.0.0

### Major Changes

- eaae490: Increase node engine requirement

### Patch Changes

- 2ae16b8: Update READMEs to be more agent friendly

## 1.0.16

### Patch Changes

- 9694f33: Bump dependencies

## 1.0.15

### Patch Changes

- 282a5b7: Bump license version
- 75d9ae4: Migrate to using per-package eslint CLI instead of Nx plugin

## 1.0.14

### Patch Changes

- 18cfe17: Add dev dependency on pnpm-dedicated-lockfile
- efd163f: Remove local files from publishing
- 37b2ec5: Move from nx-tsc to swc + tsc CLI
- 36d1c12: Bump dependencies

## 1.0.13

### Patch Changes

- e718f38: Update dependencies

## 1.0.12

### Patch Changes

- 19d5289: Fix missing test assertions
- bcd9e61: Bump dependencies
- 1387a8c: Bump sonarjs eslint and fix/ignore issues

## 1.0.11

### Patch Changes

- 3b3f77f: Bump dependencies
- 3285cb6: Bump biome version
- 9b58c82: Bump typescript version

## 1.0.10

### Patch Changes

- 1de1659: Omit CHANGELOG from publish
- 725510a: Include npmignore ignore file

## 1.0.9

### Patch Changes

- 31f81fa: Internal dependency updates
- 3e7ee18: Dependency bumps
- f6a4729: Update year in LICENSE
- 9c786d0: Update dependencies
