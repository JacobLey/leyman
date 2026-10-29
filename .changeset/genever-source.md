---
"genever": minor
---

Add `geneverSource`, which returns the same source as `genever` along with where each type's name is in it and the JSON Pointer of the schema (or `paths`) it comes from, so a tool can link a type back to its schema, as a content mapper does for go to definition.
