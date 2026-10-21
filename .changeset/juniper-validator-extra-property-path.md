---
"juniper-validator": minor
---

An issue for an extra property (`additionalProperties: false` or `unevaluatedProperties: false`) now has its `path` at that property, like missing properties, rather than at the object.
