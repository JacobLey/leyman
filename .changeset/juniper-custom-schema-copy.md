---
"juniper": patch
---

`customSchema()` deep-copies its schema when created and in `toJSON()`, so changing the object you passed in, or its output, no longer changes the schema.
