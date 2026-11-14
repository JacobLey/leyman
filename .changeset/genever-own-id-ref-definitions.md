---
"genever": patch
---

A definition with only `$id` and `$ref` that the schema itself declares is now a type like any other: `$defs: { B: { $id: 'https://example.com/b', $ref: 'root#/$defs/A' } }` generates `type B = A`, and its `$ref` is checked, so one to a document that isn't loaded fails as unsupported instead of being dropped. Only the aliases `geneverFile` adds itself, when a file's `$id` isn't the URL it was loaded from, are still seen through. So is a referenced file that only holds a `$ref`, which is now a type named after it. Two such definitions referring to each other are now a strict mode error (and `never` outside strict mode), like any other `$ref` back to the same value.
