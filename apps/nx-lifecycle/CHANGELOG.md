# nx-lifecycle

## 1.0.0

### Major Changes

- eaae490: Increase node engine requirement

### Minor Changes

- 96fcf7d: Update dependencies: @nx/devkit@23.2.1, nx@23.2.1
- 2832537: Add an Nx plugin, `nx-lifecycle/plugin`, that infers lifecycle targets when Nx builds the project graph instead of writing them to `nx.json` and `project.json`. It checks the merged configuration, and fails if `targetDefaults` or `project.json` replace a bound target's lifecycle dependency.

### Patch Changes

- d489ee1: Update dependencies: globby to 16.1.1, ci-info to 4.4.0, @swc/helpers to 0.5.19
- 39dc670: Update dependencies: @nx/devkit@22.7.12, nx@22.7.12
- d327056: Swap internal validations to use juniper-validator
- a20b8a6: Fix exposing schema.json (available at `./out/schema.json`)
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
- 26663c7: Load the executor as ES modules directly, dropping the `common-proxy` and `nx-plugin-handler` dependencies. Accept `{ "target": ..., "projects": [...] }` entries in a stage's `dependsOn`, which the schema wrongly rejected.
- 26d3081: Name the offending dependency and suggest a fix when a stage depends on another stage's hook. Warn about bindings that no project declares. Describe `$schema` in the generated JSON schema.
- 2ae16b8: Update READMEs to be more agent friendly
- 6a6633f: Update dependencies: @swc/helpers@0.5.23, @types/sinon@21.0.1, ajv@8.20.0, fast-equals@6.0.4, globby@16.2.4, mocha@11.8.0, prettier@3.9.9, sinon@21.1.2, uint8array-extras@1.6.0, yargs@18.2.0
- Updated dependencies [a87d16e]
- Updated dependencies [d327056]
- Updated dependencies [bb9d03d]
- Updated dependencies [543c387]
- Updated dependencies [9221852]
- Updated dependencies [3651dbf]
- Updated dependencies [f8cdb0e]
- Updated dependencies [48e4571]
- Updated dependencies [eaae490]
- Updated dependencies [2ae16b8]
- Updated dependencies [b87bd62]
- Updated dependencies [935f6ae]
- Updated dependencies [6a6633f]
  - format-file@1.0.0
  - juniper-validator@0.1.0
  - haywire@1.0.0
  - haywire-launcher@1.0.0
  - entry-script@4.0.0
  - parse-cwd@2.0.0
  - juniper@2.0.0

## 0.2.1

### Patch Changes

- e59da43: Remove references to archived packages
- 235c248: Expose schema as uri-reference
- f51f869: Import Ajv2020 directly instead of parsing default export
- 9694f33: Bump dependencies
- Updated dependencies [a389e60]
- Updated dependencies [2dfcf0d]
- Updated dependencies [f51f869]
- Updated dependencies [9694f33]
  - common-proxy@0.1.3
  - format-file@0.1.5
  - haywire-launcher@0.1.11
  - default-import@2.0.8
  - entry-script@3.0.9
  - haywire@0.1.8
  - nx-plugin-handler@0.2.1
  - juniper@1.2.5
  - parse-cwd@1.1.2

## 0.2.0

### Minor Changes

- 0f55ca6: Move nx devkit to peer dependencies

### Patch Changes

- 282a5b7: Bump license version
- 75d9ae4: Migrate to using per-package eslint CLI instead of Nx plugin
- Updated dependencies [1ad9f51]
- Updated dependencies [0f55ca6]
- Updated dependencies [282a5b7]
- Updated dependencies [75d9ae4]
  - nx-plugin-handler@0.2.0
  - haywire-launcher@0.1.10
  - default-import@2.0.7
  - common-proxy@0.1.2
  - entry-script@3.0.8
  - format-file@0.1.4
  - parse-cwd@1.1.1
  - haywire@0.1.7
  - juniper@1.2.4

## 0.1.1

### Patch Changes

- Updated dependencies [5c09944]
  - common-proxy@0.1.1
  - juniper@1.2.3
  - default-import@2.0.6
  - entry-script@3.0.7
  - format-file@0.1.3
  - haywire@0.1.6
  - haywire-launcher@0.1.9
  - nx-plugin-handler@0.1.1
  - parse-cwd@1.1.0

## 0.1.0

### Minor Changes

- 83964af: Add CLI version of plugin
- f531fa5: Refactor to re-use method for CLI, support loading config from file

### Patch Changes

- 18cfe17: Add dev dependency on pnpm-dedicated-lockfile
- 875d420: Use plugin handler in commonjs
- efd163f: Remove local files from publishing
- 77e247b: Pre-bind property internally
- 3e72e79: Bump container-level dependencies
- 37b2ec5: Move from nx-tsc to swc + tsc CLI
- 4c71310: Use native import to load package.json
- 36d1c12: Bump dependencies
- Updated dependencies [066d66b]
- Updated dependencies [32f4953]
- Updated dependencies [18cfe17]
- Updated dependencies [2c49726]
- Updated dependencies [b086047]
- Updated dependencies [0ff2dac]
- Updated dependencies [687a26a]
- Updated dependencies [b69df1e]
- Updated dependencies [9ad3555]
- Updated dependencies [f7ad651]
- Updated dependencies [0de94ee]
- Updated dependencies [efd163f]
- Updated dependencies [3e72e79]
- Updated dependencies [19244cd]
- Updated dependencies [f5ed1b6]
- Updated dependencies [37b2ec5]
- Updated dependencies [36d1c12]
- Updated dependencies [25d162d]
  - juniper@1.2.3
  - nx-plugin-handler@0.1.0
  - haywire-launcher@0.1.9
  - default-import@2.0.5
  - common-proxy@0.1.0
  - entry-script@3.0.7
  - format-file@0.1.3
  - parse-cwd@1.1.0
  - haywire@0.1.6

## 0.0.10

### Patch Changes

- e718f38: Update dependencies
- Updated dependencies [e718f38]
- Updated dependencies [a7248af]
  - nx-plugin-handler@0.0.9
  - default-import@2.0.4
  - common-proxy@0.0.7
  - format-file@0.1.2
  - haywire@0.1.5
  - juniper@1.2.2

## 0.0.9

### Patch Changes

- 57f2da8: Bump pnpm + nx versions
- Updated dependencies [57f2da8]
- Updated dependencies [f04c4fe]
  - nx-plugin-handler@0.0.8
  - common-proxy@0.0.6
  - format-file@0.1.1
  - juniper@1.2.1
  - default-import@2.0.3
  - haywire@0.1.4

## 0.0.8

### Patch Changes

- 4e564e5: Bump Nx version
- 19d5289: Fix missing test assertions
- bcd9e61: Bump dependencies
- 1387a8c: Bump sonarjs eslint and fix/ignore issues
- Updated dependencies [4e564e5]
- Updated dependencies [19d5289]
- Updated dependencies [784035c]
- Updated dependencies [bcd9e61]
- Updated dependencies [cbb9ef5]
- Updated dependencies [24d8e87]
- Updated dependencies [1387a8c]
- Updated dependencies [c4af482]
  - nx-plugin-handler@0.0.7
  - haywire@0.1.4
  - default-import@2.0.3
  - common-proxy@0.0.5
  - format-file@0.1.0
  - juniper@1.2.1

## 0.0.7

### Patch Changes

- 3b3f77f: Bump dependencies
- 3285cb6: Bump biome version
- 806edcb: Bump Nx Version
- bef3833: Bump Nx+pnpm, remove unnecessary non-null assertions
- 9b58c82: Bump typescript version
- 8d18262: Update dependencies
- Updated dependencies [3b3f77f]
- Updated dependencies [3285cb6]
- Updated dependencies [1489f68]
- Updated dependencies [7d6f471]
- Updated dependencies [806edcb]
- Updated dependencies [bef3833]
- Updated dependencies [9b58c82]
- Updated dependencies [8d18262]
- Updated dependencies [231acc9]
- Updated dependencies [ff72123]
  - nx-plugin-handler@0.0.6
  - default-import@2.0.2
  - common-proxy@0.0.4
  - format-file@0.0.8
  - haywire@0.1.3
  - juniper@1.2.0

## 0.0.6

### Patch Changes

- 1de1659: Omit CHANGELOG from publish
- 725510a: Include npmignore ignore file
- Updated dependencies [1de1659]
- Updated dependencies [725510a]
  - juniper@1.1.12
  - common-proxy@0.0.3
  - default-import@2.0.1
  - format-file@0.0.7
  - haywire@0.1.2
  - nx-plugin-handler@0.0.5

## 0.0.5

### Patch Changes

- Updated dependencies [2bef161]
  - default-import@2.0.0
  - juniper@1.1.11
  - format-file@0.0.6

## 0.0.4

### Patch Changes

- Updated dependencies [c5b98b0]
  - default-import@1.1.7
  - juniper@1.1.11
  - format-file@0.0.6

## 0.0.3

### Patch Changes

- Updated dependencies
  - haywire@0.1.1
  - format-file@0.0.6
  - nx-plugin-handler@0.0.4
  - juniper@1.1.11
  - default-import@1.1.6

## 0.0.2

### Patch Changes

- 31f81fa: Internal dependency updates
- 689ef38: Add README
- 3e7ee18: Dependency bumps
- f6a4729: Update year in LICENSE
- 9c786d0: Update dependencies
- Updated dependencies [3dc29d2]
- Updated dependencies [31f81fa]
- Updated dependencies [3e7ee18]
- Updated dependencies [f6a4729]
- Updated dependencies [cab8478]
- Updated dependencies [c2c0990]
- Updated dependencies [9c786d0]
- Updated dependencies [5984ed5]
  - haywire@0.1.0
  - juniper@1.1.11
  - common-proxy@0.0.2
  - default-import@1.1.6
  - format-file@0.0.5
  - nx-plugin-handler@0.0.3
