# juniper-arbitrary

## 0.2.1

### Patch Changes

- 0f4d4d5: Generate objects that need fewer retries:
  
  - A required or declared key matching `patternProperties` takes its value from every matching pattern's schema (and its declared one), where a required key without a declaration was any JSON value before. Declared and required keys are checked against `propertyNames`: an optional one it rejects is left out, and a required one makes the schema unsatisfiable when building rather than after 1000 attempts.
  - A key declared in one `allOf` (or `anyOf`, `$ref`, dependent) schema is held to the `additionalProperties` of the others that don't cover it, so a closed branch's `additionalProperties: false` leaves out keys only other branches declare (a required one makes the schema unsatisfiable when building), and these objects no longer need checking afterwards.
  - When `minProperties` or `maxProperties` limit how many optional properties fit, how many appear is chosen within the limits first, then which, and undeclared properties only fill the room left, rather than generating objects of any size and dropping those out of range (three optional properties with `maxProperties(1)` took about 2.7 attempts per value). In those objects the number of optional properties is now spread about evenly over what the limits allow, where each was included on its own before. Objects whose optional properties all fit are generated as before. More required properties than `maxProperties` allows now throws `UnsatisfiableSchemaError` when building.
- 3f4e6ac: A `$ref` to an embedded `$id` or an `$anchor` is now resolved the way JSON Schema 2020-12 does, against the base URI it sits in, so its values are generated from the schema it refers to. It used to generate any JSON value and reject the ones that didn't match (about 3 tries per value for a `$ref` to a number). A `$dynamicRef` is still left to the validator.
- 181c4ac: A URI, IRI, URI template or reference, email address, hostname, or JSON pointer (plain or relative) with a `minLength` is now lengthened to a length picked between its bounds, in its fragment, local part, labels or a new segment, rather than generated at a size and rejected when it fell short. A `uri` of 30 to 40 characters took about 4 tries per value, now 1. `byte` is drawn directly at the lengths of whole base64 groups between the bounds. With a `maxLength`, the fast-check sizes are weighted by how often their values fit, so a size that rarely does is rarely drawn. Unbounded formats generate the same values as before.
- 7b7298f: Building the first arbitrary with a plain string now takes about 20 ms instead of half a second. Strings were generated with fast-check's `binary` unit, which builds a lookup of all 1.1 million code points the first time it is used; juniper-arbitrary now uses its own unit that generates and shrinks the same values without one.
- 1f700a3: A string with a `format` or `pattern` and a `minLength` or `maxLength` is now generated at the fast-check sizes whose values fit the bounds, rather than only the default size. A long `minLength` (an `email` of at least 200 characters, a `pattern` of at least 60) used to throw `UnsatisfiableSchemaError` although the schema has values, and a short `maxLength` rejected most values before finding one (an `email` of at most 12 characters is about 7× faster).

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
