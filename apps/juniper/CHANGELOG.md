# juniper

## 2.5.0

### Minor Changes

- 07bbb23: Support the `draft-07` target of Standard JSON Schema (`schema['~standard'].jsonSchema.input({ target: 'draft-07' })`), which libraries such as the AI SDK, Mastra and TanStack AI request for tool schemas. Keywords are rewritten to their exact draft-07 forms, and a schema with none (such as one using `maxContains`) throws.

### Patch Changes

- 7e4c3b2: `homepage` points at the package's docs site page, which the README links too.
- 1fab8f0: - The published type declarations type-check with `skipLibCheck: false`.
  - `required`, `dependentRequired`, `examples`, `anyOf` and `oneOf` accept `readonly` arrays, so `as const` variables work.
  - New `NestableSchema<T>` type: annotate a schema with it, and it can still be passed to `properties`, `arraySchema` and other builders.
- d1827b1: Document the type traps in the README and JSDoc: enum values need `as const`, `required` must be an inline array, `Schema<T>` cannot be nested in builders, and `EnumSchema` has no `nullable()`. Also document `isSchema`, the tuple builder and Ajv's strict `format` error.

## 2.4.4

### Patch Changes

- ea484ef: The ESLint rule's documentation link points at the docs site's new address, under `/packages/`. The old address redirects there.

## 2.4.3

### Patch Changes

- 7e0bca5: An empty `title`, `description`, `format`, `contentEncoding` or `contentMediaType` is kept in the generated schema, as is an empty `id` passed to `toJSON()`, rather than dropped. `null` is what removes one.

## 2.4.2

### Patch Changes

- a5157a4: Type the `if`, `then` and `else` keywords of `JsonSchema` as `JsonSchema<unknown>`, not `JsonSchema<any>`, so reading them no longer opts out of type checking.

## 2.4.1

### Patch Changes

- d0f37c4: `customSchema()` deep-copies its schema when created and in `toJSON()`, so changing the object you passed in, or its output, no longer changes the schema.
- 9b900a2: Serializing a schema serializes each definition (`.define()`) once, rather than once per path to it. Definitions nested in definitions doubled the time for each level, and more when shared: ten levels of definitions that each use the one below twice took seconds to serialize, and now take under a millisecond. The output is unchanged.
- acb9ae5: An empty `pattern` no longer drops the patterns added after it.
- 23a254b: `juniper/top-level-schema` no longer reports schemas built in a function that's called immediately at module scope, like `const a = (() => objectSchema())();`, since it runs once.
- a0d3c5e: Integer `multipleOf` values are no longer merged into an inexact least common multiple when it would be above `Number.MAX_SAFE_INTEGER`. They are kept separate in `allOf`, like non-integer values.
- c7c3599: With `openApi30`, an array schema without `items` now outputs `items: {}`, since OpenAPI 3.0 requires `items` whenever `type` is `array`. It accepts the same values as before.
- b373765: With `openApi30`, string schemas no longer output `contentEncoding` or `contentMediaType`, which OpenAPI 3.0 does not define. Use `format('byte')` or `format('binary')` for OpenAPI 3.0.
- 27e43a1: With `openApi30`, an enum schema with no values outputs `not: {}` instead of `enum: []`, which OpenAPI 3.0 does not allow. Both match nothing.
- 052a681: Modifying the JSON from `toJSON()` or `components()` no longer modifies the schema. `examples`, `dependentRequired`, metadata and `default` objects were the schema's own, so pushing to `toJSON().examples` added an example to every later `toJSON()`. The output's plain objects and arrays are now copies (other values, like a class instance in metadata, are kept as is).

## 2.4.0

### Minor Changes

- f4e6b21: `ObjectSchema.oneOf(schemas, { discriminator })` declares a discriminated union. Every branch must require the property as a single, unique string value (checked at compile time), and the output gets OpenAPI's `discriminator` keyword.
- 3b797de: New `juniper/eslint` entry point with a `juniper/top-level-schema` rule, reporting schemas built inside functions or class instance fields instead of once at module scope. `eslint` is an optional peer dependency, and importing `juniper` never loads the plugin.
- 4598bf8: `toJSON({ openApi30: true })` and `components(schemas, { openApi30: true })` return the new `OpenApi30JsonSchema` type, with no boolean sub-schemas and a single `type`, so the output assigns to OpenAPI libraries' 3.0 schema types (e.g. openapi3-ts's `oas30.SchemaObject`) without a cast. Other output is still a `JsonSchema`.
- b56e9c4: New `serializeSpec(spec, options?)` serializes every Juniper schema in an OpenAPI document and fills `components.schemas` with every definition they use, so no schema has to be listed for `components()`. The dialect follows the document's `openapi` version.

## 2.3.0

### Minor Changes

- 3b3d68b: `minItems` up to 3 is now part of an array's type: `arraySchema(stringSchema()).minItems(1)` is `[string, ...string[]]` rather than `string[]`. Building an array with fewer items than the schema allows is now a type error, as it already was a validation error. Prefix items count towards `minItems`. Larger values, or a `number` variable, leave the type as an array.
  
  This is a type fix: every value the schema accepts is still assignable. Code that builds such arrays may need to narrow them first, e.g. with `(array): array is [T, ...T[]] => array.length > 0`, as a length check alone does not narrow an array.
- 2b86149: Add `.not(nullSchema())` to make a nullable schema non-nullable. It removes `null` from the type, and from the JSON Schema: `type: ['string', 'null']` becomes `type: 'string'`, or `not: { type: 'null' }` is emitted where there is no `type` (as on `mergeSchema()`). It is available on nullable string, number, object, array and tuple schemas, and on merge schemas. Previously the only way to remove `null` was `.not(stringSchema().nullable())`, which also rejects every string, so its JSON Schema accepted nothing.

### Patch Changes

- c76e471: Fix the README's Ajv example to import `{ Ajv2020 }`, which type-checks under NodeNext, and compile in strict mode. Note that `format` is emitted unchecked, so schemas using it need a validator that supports the formats they use.

## 2.2.1

### Patch Changes

- e0f1654: Correct the README and WHY-JUNIPER.md comparisons with TypeBox, Zod and other alternatives, document Standard JSON Schema support (`['~standard']`), and note which keywords OpenAPI 3.0 output drops.

## 2.2.0

### Minor Changes

- 1957cf8: Object types inferred by `SchemaType` (and by `mergeSchema`'s `allOf`, `anyOf`, `oneOf` and `if`) are now flattened into a single object type, so editors show `{ foo: string; bar?: number }` instead of `Partial<{ ... }> & Required<Pick<{ ... }, 'foo'>>`. Combined schemas show as a union of flat objects.
  
  The types are equivalent to before: properties, optional modifiers and index signatures are unchanged, and values that were assignable still are. Only exact type assertions (e.g. `expect-type`'s `toEqualTypeOf`) see the new shapes. `EmptyObject` now displays by name.

### Patch Changes

- d46a4d2: `multipleOf` values above `Number.MAX_SAFE_INTEGER` are kept as separate `allOf` entries, rather than merged with integer multiples into a least common multiple that a number can't represent exactly.

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
