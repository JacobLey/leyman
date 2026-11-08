---
"juniper-arbitrary": patch
---

Generate objects that need fewer retries:

- A required or declared key matching `patternProperties` takes its value from every matching pattern's schema (and its declared one), where a required key without a declaration was any JSON value before. Declared and required keys are checked against `propertyNames`: an optional one it rejects is left out, and a required one makes the schema unsatisfiable when building rather than after 1000 attempts.
- A key declared in one `allOf` (or `anyOf`, `$ref`, dependent) schema is held to the `additionalProperties` of the others that don't cover it, so a closed branch's `additionalProperties: false` leaves out keys only other branches declare (a required one makes the schema unsatisfiable when building), and these objects no longer need checking afterwards.
