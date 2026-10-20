# juniper-validator

## 0.4.0

### Minor Changes

- c95506c: Ajv's `discriminator` option is on by default, so Juniper's discriminated unions validate. Pass `discriminator: false` to turn it off.

### Patch Changes

- Updated dependencies [f4e6b21]
- Updated dependencies [3b797de]
- Updated dependencies [4598bf8]
- Updated dependencies [b56e9c4]
  - juniper@2.4.0

## 0.3.0

### Minor Changes

- 2f23848: Fill each issue's Standard Schema `path`, so libraries that show errors next to a field can place them. It is read from Ajv's `instancePath`, with array indices as numbers, and an issue for a missing property (`required` or `dependentRequired`) is placed at that property.
  
  `jsPropertySyntax` is no longer accepted in `makeValidator`'s options, so `instancePath` is always a JSON Pointer. The option is deprecated by Ajv.
- ab93f0e: Implement Standard JSON Schema on validators, so libraries that need both a JSON Schema and a validator can take one object. `validator['~standard'].jsonSchema` is the Juniper schema's, or, for a validator made from a rendered JSON Schema object, returns that object for the `draft-2020-12` target.

### Patch Changes

- 753e513: With Ajv's `messages: false`, `validate()` returned no issues for an invalid value, as issues without a message were left out. Each now gets a message naming its keyword, like `must pass "type" keyword validation`.
- 0461679: Accept schemas with `.metadata()` keywords, which strict mode rejected as unknown. They're registered with Ajv as annotations. Unknown keywords in a rendered JSON Schema object are still rejected.
- Updated dependencies [e0f1654]
  - juniper@2.2.1

## 0.2.1

### Patch Changes

- 9562c45: Remove the unused `escape-string-regexp` dependency.
- Updated dependencies [1957cf8]
- Updated dependencies [d46a4d2]
  - juniper@2.2.0

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
