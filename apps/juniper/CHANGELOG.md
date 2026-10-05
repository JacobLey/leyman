# juniper

## 2.1.0

### Minor Changes

- 154d9b2: Add `schema.define(name)` for reusable definitions. A defined schema is emitted as a `$ref` wherever it is used, and `toJSON()` adds every definition it references to `$defs`, so references never point at a missing definition. Derived schemas keep the reference for annotations and `nullable()`, and are emitted inline otherwise. Add `components(schemas, options)` to collect definitions for OpenAPI's `components.schemas`, and a `definitionsPath` option to `toJSON`.
  
  Add `defineRecursive<T>(name, self => schema)` for schemas that reference themselves, such as trees or comment threads. The type is declared explicitly and the built schema is checked against it. `self` is emitted as a `$ref` to the definition, and supports `nullable()` and annotations.
  
  Fixes:
  - A `.ref()` schema nested inside another schema (e.g. as a property) threw `this.getDefaultValues is not a function` when serialized.
  - OpenAPI 3.0 output used `true`/`false` as property schemas, which OpenAPI 3.0 does not allow. They are now `{}` and `{ not: {} }`.
  
  `JsonSchema['type']` is now typed as the JSON Schema type names (exported as `JsonSchemaType`) rather than `string`.
- f8f3040: Add `ObjectSchema.extend(schema)` to add the properties and `required` of another object schema. Duplicate properties are rejected, and `additionalProperties` applies to the combined properties, so a closed object stays closed.
  
  `required()` with no keys marks every property as required, the inverse of `partial()`.
  
  `StringSchema.format` autocompletes the formats defined by JSON Schema and OpenAPI 3.0 (exported as `KnownFormat`), and still accepts any string.
  
  `$defs` and `components()` are sorted by name, so output no longer depends on the order definitions are used in.
- 6e1b3d8: Add `pick`, `omit` and `partial` to `ObjectSchema`, to derive variants of an object schema (such as create, update and response shapes) with matching types. Keys are checked against the schema's properties.

### Patch Changes

- 8d4d541: Type errors now say what is wrong: `properties()` names a property that is already defined, `items()`/`contains()` say they are already set, and `metadata()` names a reserved JSON Schema keyword. Previously these read as `Expected 2 arguments, but got 1` or `not assignable to '[never]'`.
- 15f5262: Fix README links that were broken on npm: relative links (such as WHY files and sibling packages) are now absolute, table-of-contents anchors match their headings, LICENSE badges point at the right path, and `repository` now names the package's directory in the monorepo.
- ac478a2: Make the package easier to find and evaluate: a clearer npm description and keywords, and a README that opens with highlights and how it compares to alternatives.

## 2.0.0

### Major Changes

- eaae490: Increase node engine requirement

### Patch Changes

- 2ae16b8: Update READMEs to be more agent friendly
- 935f6ae: Update typing to remove unnecessary generic

## 1.2.5

### Patch Changes

- f51f869: Import Ajv2020 directly instead of parsing default export
- 9694f33: Bump dependencies

## 1.2.4

### Patch Changes

- 282a5b7: Bump license version
- 75d9ae4: Migrate to using per-package eslint CLI instead of Nx plugin

## 1.2.3

### Patch Changes

- 066d66b: Cast schemas comply fully with schema type
- 32f4953: Update TS assertions
- 18cfe17: Add dev dependency on pnpm-dedicated-lockfile
- efd163f: Remove local files from publishing
- 37b2ec5: Move from nx-tsc to swc + tsc CLI
- 36d1c12: Bump dependencies

## 1.2.2

### Patch Changes

- e718f38: Update dependencies
- a7248af: Use consistent record type

## 1.2.1

### Patch Changes

- bcd9e61: Bump dependencies
- 1387a8c: Bump sonarjs eslint and fix/ignore issues

## 1.2.0

### Minor Changes

- 1489f68: Enforce reserved words at runtime

### Patch Changes

- 3b3f77f: Bump dependencies
- 3285cb6: Bump biome version
- 9b58c82: Bump typescript version
- ff72123: Bump typescript eslint, apply/ignore rules

## 1.1.12

### Patch Changes

- 1de1659: Omit CHANGELOG from publish
- 725510a: Include npmignore ignore file

## 1.1.11

### Patch Changes

- 3dc29d2: Update JSDoc
- 31f81fa: Internal dependency updates
- 3e7ee18: Dependency bumps
- f6a4729: Update year in LICENSE
- 9c786d0: Update dependencies
