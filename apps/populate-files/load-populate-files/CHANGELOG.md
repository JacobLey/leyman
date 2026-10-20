# load-populate-files

## 1.1.1

### Patch Changes

- Updated dependencies [5ab7f8a]
- Updated dependencies [b40f828]
- Updated dependencies [f4e6b21]
- Updated dependencies [3b797de]
- Updated dependencies [4598bf8]
- Updated dependencies [b56e9c4]
- Updated dependencies [c95506c]
- Updated dependencies [73bfe20]
  - haywire-launcher@1.0.3
  - haywire@2.0.1
  - juniper@2.4.0
  - juniper-validator@0.4.0
  - populate-files@1.1.1

## 1.1.0

### Minor Changes

- 50bf351: Add a `manifest` option (`--manifest`): a run records every generated file in a `generated-signature` manifest, so edits to any file type (including JSON) are detected and not overwritten without `force`, and `clean` only removes files the manifest lists. Files can record `manifestInputs`. With `check` and `clean`, out-of-date and stale files are now reported in one error.
- 10f37ef: Add opt-in `signed: true` per file: content is signed with `generated-signature`, manual sections are kept when regenerating, and files that were edited outside manual sections (or never signed) are not overwritten unless `force` (`--force`) is set. `options` is now optional in the `PopulateFile`/`PopulateFiles` types, matching the docs.

### Patch Changes

- Updated dependencies [50bf351]
- Updated dependencies [10f37ef]
  - populate-files@1.1.0

## 1.0.3

### Patch Changes

- 2b8de27: Recognize a missing JS file by its `ERR_MODULE_NOT_FOUND` code (with [`unknown-error`](https://www.npmjs.com/package/unknown-error)'s `hasCode`) instead of searching the error's text, which also matched any other error that mentioned it, and could throw on a thrown value whose `toString` throws.
- Updated dependencies [23a101a]
- Updated dependencies [e0f1654]
- Updated dependencies [2f23848]
- Updated dependencies [ab93f0e]
- Updated dependencies [753e513]
- Updated dependencies [0461679]
- Updated dependencies [981857a]
- Updated dependencies [20d431b]
- Updated dependencies [3268880]
- Updated dependencies [54037a8]
- Updated dependencies [2851c68]
- Updated dependencies [10e4fe6]
- Updated dependencies [f6c298e]
  - haywire@2.0.0
  - juniper@2.2.1
  - juniper-validator@0.3.0
  - populate-files@1.0.2
  - unknown-error@0.1.0
  - haywire-launcher@1.0.2

## 1.0.2

### Patch Changes

- d9a436d: The CLI collects its commands from a haywire list instead of registering each by hand. No change to commands or options.
- a42e135: The "JS file not found" error has the original import error as its `cause`.
- Updated dependencies [6fc113c]
- Updated dependencies [9469c47]
- Updated dependencies [ec5c0e6]
- Updated dependencies [04f66c2]
- Updated dependencies [1957cf8]
- Updated dependencies [d46a4d2]
- Updated dependencies [9562c45]
- Updated dependencies [d253201]
  - entry-script@4.1.0
  - haywire@1.1.1
  - juniper@2.2.0
  - juniper-validator@0.2.1
  - parse-cwd@2.0.2

## 1.0.1

### Patch Changes

- 15f5262: Fix README links that were broken on npm: relative links (such as WHY files and sibling packages) are now absolute, table-of-contents anchors match their headings, LICENSE badges point at the right path, and `repository` now names the package's directory in the monorepo.
- Updated dependencies [154d9b2]
- Updated dependencies [f8f3040]
- Updated dependencies [6e1b3d8]
- Updated dependencies [8d4d541]
- Updated dependencies [154d9b2]
- Updated dependencies [15f5262]
- Updated dependencies [ac478a2]
  - juniper@2.1.0
  - juniper-validator@0.2.0
  - populate-files@1.0.1
  - default-import@3.0.1
  - entry-script@4.0.1
  - parse-cwd@2.0.1

## 1.0.0

### Major Changes

- eaae490: Increase node engine requirement

### Minor Changes

- ca44cd6: Add `clean` option which checks that entire directory is in sync
- a20b8a6: Add `target dir` option that writes output file paths with respect to directory

### Patch Changes

- d489ee1: Update dependencies: globby to 16.1.1, ci-info to 4.4.0, @swc/helpers to 0.5.19
- d327056: Swap internal validations to use juniper-validator
- fe61321: Remove `haywire` (and `haywire-launcher`) dependency in favor of direct imports
- 2ae16b8: Update READMEs to be more agent friendly
- 6a6633f: Update dependencies: @swc/helpers@0.5.23, @types/sinon@21.0.1, ajv@8.20.0, fast-equals@6.0.4, globby@16.2.4, mocha@11.8.0, prettier@3.9.9, sinon@21.1.2, uint8array-extras@1.6.0, yargs@18.2.0
- Updated dependencies [d489ee1]
- Updated dependencies [d327056]
- Updated dependencies [ca44cd6]
- Updated dependencies [48e4571]
- Updated dependencies [a20b8a6]
- Updated dependencies [fe61321]
- Updated dependencies [eaae490]
- Updated dependencies [2ae16b8]
- Updated dependencies [935f6ae]
- Updated dependencies [6a6633f]
  - populate-files@1.0.0
  - juniper-validator@0.1.0
  - default-import@3.0.0
  - entry-script@4.0.0
  - parse-cwd@2.0.0
  - juniper@2.0.0

## 0.1.2

### Patch Changes

- e59da43: Remove references to archived packages
- f51f869: Import Ajv2020 directly instead of parsing default export
- 9694f33: Bump dependencies
- Updated dependencies [2dfcf0d]
- Updated dependencies [e59da43]
- Updated dependencies [f51f869]
- Updated dependencies [9694f33]
  - haywire-launcher@0.1.11
  - default-import@2.0.8
  - entry-script@3.0.9
  - haywire@0.1.8
  - populate-files@0.2.4
  - juniper@1.2.5
  - parse-cwd@1.1.2

## 0.1.1

### Patch Changes

- 282a5b7: Bump license version
- 75d9ae4: Migrate to using per-package eslint CLI instead of Nx plugin
- Updated dependencies [282a5b7]
- Updated dependencies [75d9ae4]
  - populate-files@0.2.3
  - haywire-launcher@0.1.10
  - default-import@2.0.7
  - entry-script@3.0.8
  - parse-cwd@1.1.1
  - haywire@0.1.7
  - juniper@1.2.4

## 0.1.0

### Minor Changes

- bc9c9e1: Add CLI version

### Patch Changes

- e5209ca: Refactor to use DI, add tests
- 93cdd8a: Use local version of dependency
- 18cfe17: Add dev dependency on pnpm-dedicated-lockfile
- 2e2c63f: Update dependencies
- efd163f: Remove local files from publishing
- 7f6d058: Fix command builder type to not require this
- 37b2ec5: Move from nx-tsc to swc + tsc CLI
- 4c71310: Use native import to load package.json
- 36d1c12: Bump dependencies
- Updated dependencies [066d66b]
- Updated dependencies [51d0c08]
- Updated dependencies [32f4953]
- Updated dependencies [18cfe17]
- Updated dependencies [e3697e0]
- Updated dependencies [2c49726]
- Updated dependencies [0ff2dac]
- Updated dependencies [687a26a]
- Updated dependencies [761204f]
- Updated dependencies [5705fa7]
- Updated dependencies [efd163f]
- Updated dependencies [37b2ec5]
- Updated dependencies [36d1c12]
  - juniper@1.2.3
  - populate-files@0.2.2
  - haywire-launcher@0.1.9
  - default-import@2.0.5
  - entry-script@3.0.7
  - parse-cwd@1.1.0
  - haywire@0.1.6

## 0.0.11

### Patch Changes

- e718f38: Update dependencies
- Updated dependencies [e718f38]
  - populate-files@0.1.2
  - default-import@2.0.4

## 0.0.10

### Patch Changes

- default-import@2.0.3
- populate-files@0.1.1

## 0.0.9

### Patch Changes

- bcd9e61: Bump dependencies
- Updated dependencies [4e564e5]
- Updated dependencies [374c2ec]
- Updated dependencies [bcd9e61]
- Updated dependencies [1387a8c]
  - populate-files@0.1.0
  - default-import@2.0.3

## 0.0.8

### Patch Changes

- 3b3f77f: Bump dependencies
- 3285cb6: Bump biome version
- 9b58c82: Bump typescript version
- 41a9b84: Remove unused nyc dependency
- Updated dependencies [3b3f77f]
- Updated dependencies [3285cb6]
- Updated dependencies [9b58c82]
- Updated dependencies [41a9b84]
  - populate-files@0.0.6
  - default-import@2.0.2

## 0.0.7

### Patch Changes

- 1de1659: Omit CHANGELOG from publish
- 725510a: Include npmignore ignore file
- Updated dependencies [1de1659]
- Updated dependencies [725510a]
  - populate-files@0.0.5
  - default-import@2.0.1

## 0.0.6

### Patch Changes

- Updated dependencies [2bef161]
  - default-import@2.0.0

## 0.0.5

### Patch Changes

- Updated dependencies [c5b98b0]
  - default-import@1.1.7

## 0.0.4

### Patch Changes

- populate-files@0.0.4
- default-import@1.1.6

## 0.0.3

### Patch Changes

- 31f81fa: Internal dependency updates
- 86a26b1: Add README
- 3e7ee18: Dependency bumps
- f6a4729: Update year in LICENSE
- 9c786d0: Update dependencies
- 329146b: Add README
- Updated dependencies [31f81fa]
- Updated dependencies [85c052c]
- Updated dependencies [86a26b1]
- Updated dependencies [3e7ee18]
- Updated dependencies [f6a4729]
- Updated dependencies [9c786d0]
  - populate-files@0.0.3
  - default-import@1.1.6
