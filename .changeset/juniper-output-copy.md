---
"juniper": patch
---

Modifying the JSON from `toJSON()` or `components()` no longer modifies the schema. `examples`, `dependentRequired`, metadata and `default` objects were the schema's own, so pushing to `toJSON().examples` added an example to every later `toJSON()`. The output's plain objects and arrays are now copies (other values, like a class instance in metadata, are kept as is).
