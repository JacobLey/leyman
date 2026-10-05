# populate-files

## 1.0.1

### Patch Changes

- 15f5262: Fix README links that were broken on npm: relative links (such as WHY files and sibling packages) are now absolute, table-of-contents anchors match their headings, LICENSE badges point at the right path, and `repository` now names the package's directory in the monorepo.
- Updated dependencies [15f5262]
  - format-file@1.0.1
  - parse-cwd@2.0.1

## 1.0.0

### Major Changes

- eaae490: Increase node engine requirement

### Minor Changes

- ca44cd6: Add `clean` option which checks that entire directory is in sync
- a20b8a6: Add `target dir` option that writes output file paths with respect to directory

### Patch Changes

- d489ee1: Update dependencies: globby to 16.1.1, ci-info to 4.4.0, @swc/helpers to 0.5.19
- fe61321: Remove `haywire` (and `haywire-launcher`) dependency in favor of direct imports
- 2ae16b8: Update READMEs to be more agent friendly
- 6a6633f: Update dependencies: @swc/helpers@0.5.23, @types/sinon@21.0.1, ajv@8.20.0, fast-equals@6.0.4, globby@16.2.4, mocha@11.8.0, prettier@3.9.9, sinon@21.1.2, uint8array-extras@1.6.0, yargs@18.2.0
- Updated dependencies [a87d16e]
- Updated dependencies [bb9d03d]
- Updated dependencies [543c387]
- Updated dependencies [eaae490]
- Updated dependencies [2ae16b8]
- Updated dependencies [6a6633f]
  - format-file@1.0.0
  - parse-cwd@2.0.0

## 0.2.4

### Patch Changes

- e59da43: Remove references to archived packages
- 9694f33: Bump dependencies
- Updated dependencies [a389e60]
- Updated dependencies [2dfcf0d]
- Updated dependencies [9694f33]
  - format-file@0.1.5
  - haywire@0.1.8
  - parse-cwd@1.1.2

## 0.2.3

### Patch Changes

- 282a5b7: Bump license version
- 75d9ae4: Migrate to using per-package eslint CLI instead of Nx plugin
- Updated dependencies [282a5b7]
- Updated dependencies [75d9ae4]
  - format-file@0.1.4
  - parse-cwd@1.1.1
  - haywire@0.1.7

## 0.2.2

### Patch Changes

- 51d0c08: Add unit tests w/full test coverage
- 18cfe17: Add dev dependency on pnpm-dedicated-lockfile
- e3697e0: Add integration test
- 2c49726: Use local dependency of nx-update-ts-references
- 761204f: Refactor to use DI
- 5705fa7: Include test packages
- efd163f: Remove local files from publishing
- 37b2ec5: Move from nx-tsc to swc + tsc CLI
- 36d1c12: Bump dependencies
- Updated dependencies [18cfe17]
- Updated dependencies [2c49726]
- Updated dependencies [687a26a]
- Updated dependencies [b69df1e]
- Updated dependencies [efd163f]
- Updated dependencies [37b2ec5]
- Updated dependencies [36d1c12]
- Updated dependencies [25d162d]
  - format-file@0.1.3
  - parse-cwd@1.1.0
  - haywire@0.1.6

## 0.2.1

### Patch Changes

- Rebuilt package before publish

## 0.2.0

### Minor Changes

- b77dd42: Export type of methods alongside method

## 0.1.2

### Patch Changes

- e718f38: Update dependencies
- Updated dependencies [e718f38]
  - format-file@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [f04c4fe]
  - format-file@0.1.1

## 0.1.0

### Minor Changes

- 374c2ec: Support null for populate files options

### Patch Changes

- 4e564e5: Bump Nx version
- bcd9e61: Bump dependencies
- 1387a8c: Bump sonarjs eslint and fix/ignore issues
- Updated dependencies [bcd9e61]
- Updated dependencies [24d8e87]
- Updated dependencies [c4af482]
  - format-file@0.1.0

## 0.0.6

### Patch Changes

- 3b3f77f: Bump dependencies
- 3285cb6: Bump biome version
- 9b58c82: Bump typescript version
- 41a9b84: Remove unused nyc dependency
- Updated dependencies [3b3f77f]
- Updated dependencies [3285cb6]
- Updated dependencies [9b58c82]
- Updated dependencies [231acc9]
  - format-file@0.0.8

## 0.0.5

### Patch Changes

- 1de1659: Omit CHANGELOG from publish
- 725510a: Include npmignore ignore file
- Updated dependencies [1de1659]
- Updated dependencies [725510a]
  - format-file@0.0.7

## 0.0.4

### Patch Changes

- format-file@0.0.6

## 0.0.3

### Patch Changes

- 31f81fa: Internal dependency updates
- 85c052c: Add README
- 86a26b1: Add README
- 3e7ee18: Dependency bumps
- f6a4729: Update year in LICENSE
- 9c786d0: Update dependencies
- Updated dependencies [31f81fa]
- Updated dependencies [3e7ee18]
- Updated dependencies [f6a4729]
- Updated dependencies [9c786d0]
  - format-file@0.0.5
