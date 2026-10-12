---
"haywire": patch
---

Export the `CombineListOutputs` type. A module or container with list bindings could not be exported from a package that emits declarations, as TypeScript could not name its type (`TS2883`).
