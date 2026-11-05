# juniper-arbitrary

## 0.2.0

### Minor Changes

- 8461cca: Supports Node.js 22.13 and later: `engines.node` is now `>=22.13.0`, down from `>=24`, the oldest version ESLint supports: juniper and generated-signature have it as an optional peer dependency, for their ESLint rules, and juniper-arbitrary and juniper-validator follow juniper.

### Patch Changes

- Updated dependencies [8461cca]
- Updated dependencies [8461cca]
  - juniper@2.7.0
  - default-import@3.1.0

## 0.1.0

### Minor Changes

- 19f95d8: First release: `makeArbitrary(schema)` creates a fast-check arbitrary of the values a Juniper schema accepts.

### Patch Changes

- Updated dependencies [79049ed]
- Updated dependencies [8985da9]
- Updated dependencies [9662f1f]
- Updated dependencies [09afd62]
  - juniper@2.6.0
