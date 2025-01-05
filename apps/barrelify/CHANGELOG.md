# barrelify

## 1.3.2

### Patch Changes

- 282a5b7: Bump license version
- 75d9ae4: Migrate to using per-package eslint CLI instead of Nx plugin
- Updated dependencies [282a5b7]
- Updated dependencies [75d9ae4]
  - haywire-launcher@0.1.10
  - default-import@2.0.7
  - entry-script@3.0.8
  - find-import@1.0.13
  - parse-cwd@1.1.1
  - haywire@0.1.7
  - juniper@1.2.4

## 1.3.0

### Minor Changes

- 3aa19b1: Use populate-files instead of managing check manually

### Patch Changes

- 18cfe17: Add dev dependency on pnpm-dedicated-lockfile
- 88efb22: Update type detection for barrelify
- 8bdcb2e: Pre-bind property internally
- 4a7f64e: Load ParseCwd type directly from source
- efd163f: Remove local files from publishing
- 7f6d058: Fix command builder type to not require this
- 37b2ec5: Move from nx-tsc to swc + tsc CLI
- 5dabcd6: Load package.json directly
- 84be94c: Fix CI enforcement
- 4c71310: Use native import to load package.json
- 36d1c12: Bump dependencies
- 1b92daa: Throw error instead of setting exit code and log
- Updated dependencies [066d66b]
- Updated dependencies [32f4953]
- Updated dependencies [18cfe17]
- Updated dependencies [0ff2dac]
- Updated dependencies [687a26a]
- Updated dependencies [efd163f]
- Updated dependencies [37b2ec5]
- Updated dependencies [36d1c12]
  - juniper@1.2.3
  - haywire-launcher@0.1.9
  - default-import@2.0.5
  - entry-script@3.0.7
  - find-import@1.0.12
  - parse-cwd@1.1.0
  - haywire@0.1.6

## 1.2.3

### Patch Changes

- e718f38: Update dependencies
- d020dd1: Remove rogue console.log, fix test for ci
- Updated dependencies [e718f38]
- Updated dependencies [a7248af]
  - haywire-launcher@0.1.8
  - default-import@2.0.4
  - entry-script@3.0.6
  - find-import@1.0.11
  - parse-cwd@1.0.13
  - haywire@0.1.5
  - juniper@1.2.2

## 1.2.2

### Patch Changes

- c252212: Use haywire DI instead of named-patch
- Updated dependencies [98dba6a]
  - haywire-launcher@0.1.7
  - juniper@1.2.1
  - default-import@2.0.3
  - entry-script@3.0.5
  - find-import@1.0.10
  - parse-cwd@1.0.12
  - haywire@0.1.4

## 1.2.1

### Patch Changes

- 2267d42: Ignored parameters should start with \_
- bcd9e61: Bump dependencies
- 1387a8c: Bump sonarjs eslint and fix/ignore issues
- Updated dependencies [19d5289]
- Updated dependencies [bcd9e61]
- Updated dependencies [1387a8c]
  - named-patch@1.0.12
  - default-import@2.0.3
  - entry-script@3.0.5
  - find-import@1.0.10
  - parse-cwd@1.0.12

## 1.2.0

### Minor Changes

- 7d6f471: Add support for type-only exports to barrels

### Patch Changes

- 3b3f77f: Bump dependencies
- 3285cb6: Bump biome version
- 9b58c82: Bump typescript version
- Updated dependencies [3b3f77f]
- Updated dependencies [3285cb6]
- Updated dependencies [9b58c82]
- Updated dependencies [41a9b84]
- Updated dependencies [ff72123]
  - default-import@2.0.2
  - entry-script@3.0.4
  - find-import@1.0.9
  - named-patch@1.0.11
  - parse-cwd@1.0.11

## 1.1.12

### Patch Changes

- 1de1659: Omit CHANGELOG from publish
- 725510a: Include npmignore ignore file
- Updated dependencies [1de1659]
- Updated dependencies [725510a]
  - default-import@2.0.1
  - entry-script@3.0.3
  - find-import@1.0.8
  - named-patch@1.0.10
  - parse-cwd@1.0.10

## 1.1.11

### Patch Changes

- Updated dependencies [2bef161]
  - default-import@2.0.0
  - entry-script@3.0.2

## 1.1.10

### Patch Changes

- Updated dependencies [c5b98b0]
  - default-import@1.1.7
  - entry-script@3.0.1

## 1.1.9

### Patch Changes

- 63ba4c6: Replace yargs parsing with EntryScript
- 31f81fa: Internal dependency updates
- 6c29730: Update usage of entry-script internally
- 7d3484f: Make sinon-typed-stub a dev dependency
- 3e7ee18: Dependency bumps
- f6a4729: Update year in LICENSE
- 9c786d0: Update dependencies
- Updated dependencies [f9e63fa]
- Updated dependencies [4cbcb04]
- Updated dependencies [6467d6f]
- Updated dependencies [31f81fa]
- Updated dependencies [3e7ee18]
- Updated dependencies [f6a4729]
- Updated dependencies [9c786d0]
- Updated dependencies [5984ed5]
  - entry-script@3.0.0
  - default-import@1.1.6
  - find-import@1.0.7
  - named-patch@1.0.9
  - parse-cwd@1.0.9
