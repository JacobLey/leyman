# juniper-validator

## 0.2.0

### Minor Changes

- 154d9b2: Validate standard formats (`email`, `uuid`, `date-time`, ...) with ajv-formats. Schemas using them previously failed to compile under Ajv's strict mode.

### Patch Changes

- 15f5262: Fix README links that were broken on npm: relative links (such as WHY files and sibling packages) are now absolute, table-of-contents anchors match their headings, LICENSE badges point at the right path, and `repository` now names the package's directory in the monorepo.
- Updated dependencies [154d9b2]
- Updated dependencies [f8f3040]
- Updated dependencies [6e1b3d8]
- Updated dependencies [8d4d541]
- Updated dependencies [15f5262]
- Updated dependencies [ac478a2]
  - juniper@2.1.0
  - default-import@3.0.1

## 0.1.0

### Minor Changes

- 48e4571: Require juniper 2 as a peer dependency

### Patch Changes

- d327056: Swap internal validations to use juniper-validator
- 2ae16b8: Update READMEs to be more agent friendly
- 6a6633f: Update dependencies: @swc/helpers@0.5.23, @types/sinon@21.0.1, ajv@8.20.0, fast-equals@6.0.4, globby@16.2.4, mocha@11.8.0, prettier@3.9.9, sinon@21.1.2, uint8array-extras@1.6.0, yargs@18.2.0
- Updated dependencies [eaae490]
- Updated dependencies [2ae16b8]
- Updated dependencies [935f6ae]
  - juniper@2.0.0
