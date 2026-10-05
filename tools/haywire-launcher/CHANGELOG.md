# haywire-launcher

## 1.0.1

### Patch Changes

- 15f5262: Fix README links that were broken on npm: relative links (such as WHY files and sibling packages) are now absolute, table-of-contents anchors match their headings, LICENSE badges point at the right path, and `repository` now names the package's directory in the monorepo.
- Updated dependencies [a59b9b4]
- Updated dependencies [474fda9]
- Updated dependencies [5ecdfe1]
- Updated dependencies [898a75c]
- Updated dependencies [15f5262]
- Updated dependencies [ac478a2]
  - haywire@1.1.0
  - entry-script@4.0.1

## 1.0.0

### Major Changes

- eaae490: Increase node engine requirement

### Minor Changes

- 3651dbf: Rename haywire APIs to clearer, less overloaded names. This is a breaking change:
  
  | Before | After |
  |--------|-------|
  | `Factory` | `ContainerFactory` |
  | `createFactory()` / `module.toFactory()` | `createContainerFactory()` / `module.toContainerFactory()` |
  | `factory.register(id, instance)` | `containerFactory.bindInstance(id, instance)` |
  | `AsyncContainer` | `Container` |
  | `optimisticSingletonScope` / `optimisticRequestScope` | `eagerSingletonScope` / `eagerRequestScope` |
  | `supplierScope` | `isolatedRequestScope` |
  | `withGenerator()` / `withAsyncGenerator()` / `withConstructorGenerator()` | `withFactory()` / `withAsyncFactory()` / `withConstructorFactory()` |
  | `id.lateBinding()` / `LateBinding<T>` / `id.annotations.lateBinding` | `id.deferred()` / `Deferred<T>` / `id.annotations.deferred` |
  
  `haywire-launcher` now requires the renamed `Container` type.

### Patch Changes

- 9221852: Add `list()` annotations to haywire, allowing multiple bindings to contribute elements to a single array dependency (`list('multi')` providers contribute several elements at once).
- 2ae16b8: Update READMEs to be more agent friendly
- Updated dependencies [9221852]
- Updated dependencies [3651dbf]
- Updated dependencies [f8cdb0e]
- Updated dependencies [eaae490]
- Updated dependencies [2ae16b8]
- Updated dependencies [b87bd62]
  - haywire@1.0.0
  - entry-script@4.0.0

## 0.1.11

### Patch Changes

- 2dfcf0d: Refactor dependencies to not require pnpmfile
- 9694f33: Bump dependencies
- Updated dependencies [2dfcf0d]
- Updated dependencies [9694f33]
  - entry-script@3.0.9
  - haywire@0.1.8

## 0.1.10

### Patch Changes

- 282a5b7: Bump license version
- 75d9ae4: Migrate to using per-package eslint CLI instead of Nx plugin
- Updated dependencies [282a5b7]
- Updated dependencies [75d9ae4]
  - entry-script@3.0.8
  - haywire@0.1.7

## 0.1.9

### Patch Changes

- 18cfe17: Add dev dependency on pnpm-dedicated-lockfile
- 0ff2dac: Move entry-script to peer dependency
- efd163f: Remove local files from publishing
- 37b2ec5: Move from nx-tsc to swc + tsc CLI
- 36d1c12: Bump dependencies
- Updated dependencies [18cfe17]
- Updated dependencies [efd163f]
- Updated dependencies [37b2ec5]
- Updated dependencies [36d1c12]
  - entry-script@3.0.7
  - haywire@0.1.6

## 0.1.8

### Patch Changes

- e718f38: Update dependencies
- Updated dependencies [e718f38]
  - entry-script@3.0.6
  - haywire@0.1.5

## 0.1.7

### Patch Changes

- 98dba6a: Expose main wrapper type
  - entry-script@3.0.5
  - haywire@0.1.4

## 0.1.6

### Patch Changes

- bcd9e61: Bump dependencies
- Updated dependencies [19d5289]
- Updated dependencies [784035c]
- Updated dependencies [bcd9e61]
- Updated dependencies [cbb9ef5]
- Updated dependencies [24d8e87]
- Updated dependencies [1387a8c]
- Updated dependencies [c4af482]
  - haywire@0.1.4
  - entry-script@3.0.5

## 0.1.5

### Patch Changes

- 3b3f77f: Bump dependencies
- 3285cb6: Bump biome version
- 9b58c82: Bump typescript version
- Updated dependencies [3b3f77f]
- Updated dependencies [3285cb6]
- Updated dependencies [7d6f471]
- Updated dependencies [9b58c82]
- Updated dependencies [231acc9]
- Updated dependencies [ff72123]
  - entry-script@3.0.4
  - haywire@0.1.3

## 0.1.4

### Patch Changes

- 1de1659: Omit CHANGELOG from publish
- 725510a: Include npmignore ignore file
- Updated dependencies [1de1659]
- Updated dependencies [725510a]
  - entry-script@3.0.3
  - haywire@0.1.2

## 0.1.3

### Patch Changes

- entry-script@3.0.2

## 0.1.2

### Patch Changes

- entry-script@3.0.1

## 0.1.1

### Patch Changes

- Updated dependencies
  - haywire@0.1.1
  - entry-script@3.0.0

## 1.0.0

### Patch Changes

- 9c786d0: Update dependencies
- Updated dependencies [3dc29d2]
- Updated dependencies [f9e63fa]
- Updated dependencies [4cbcb04]
- Updated dependencies [6467d6f]
- Updated dependencies [31f81fa]
- Updated dependencies [3e7ee18]
- Updated dependencies [f6a4729]
- Updated dependencies [cab8478]
- Updated dependencies [c2c0990]
- Updated dependencies [9c786d0]
- Updated dependencies [5984ed5]
  - haywire@0.1.0
  - entry-script@3.0.0
