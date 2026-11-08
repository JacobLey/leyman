---
'juniper-arbitrary': patch
---

Generate objects that need fewer retries:

- A required or declared key matching `patternProperties` takes its value from every matching pattern's schema (and its declared one), where a required key without a declaration was any JSON value before. Declared and required keys are checked against `propertyNames`: an optional one it rejects is left out, and a required one makes the schema unsatisfiable when building rather than after 1000 attempts.
- A key declared in one `allOf` (or `anyOf`, `$ref`, dependent) schema is held to the `additionalProperties` of the others that don't cover it, so a closed branch's `additionalProperties: false` leaves out keys only other branches declare (a required one makes the schema unsatisfiable when building), and these objects no longer need checking afterwards.
- When `minProperties` or `maxProperties` limit how many optional properties fit, how many appear is chosen within the limits first, then which, and undeclared properties only fill the room left, rather than generating objects of any size and dropping those out of range (three optional properties with `maxProperties(1)` took about 2.7 attempts per value). In those objects the number of optional properties is now spread about evenly over what the limits allow, where each was included on its own before. Objects whose optional properties all fit are generated as before. More required properties than `maxProperties` allows now throws `UnsatisfiableSchemaError` when building.
