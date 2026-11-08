---
'juniper-arbitrary': patch
---

A `$ref` to an embedded `$id` or an `$anchor` is now resolved the way JSON Schema 2020-12 does, against the base URI it sits in, so its values are generated from the schema it refers to. It used to generate any JSON value and reject the ones that didn't match (about 3 tries per value for a `$ref` to a number). A `$dynamicRef` is still left to the validator.
