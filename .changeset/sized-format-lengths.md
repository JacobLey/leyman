---
'juniper-arbitrary': patch
---

A string with a `format` or `pattern` and a `minLength` or `maxLength` is now generated at the fast-check sizes whose values fit the bounds, rather than only the default size. A long `minLength` (an `email` of at least 200 characters, a `pattern` of at least 60) used to throw `UnsatisfiableSchemaError` although the schema has values, and a short `maxLength` rejected most values before finding one (an `email` of at most 12 characters is about 7× faster).
