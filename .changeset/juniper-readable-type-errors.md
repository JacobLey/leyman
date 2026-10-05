---
"juniper": patch
---

Type errors now say what is wrong: `properties()` names a property that is already defined, `items()`/`contains()` say they are already set, and `metadata()` names a reserved JSON Schema keyword. Previously these read as `Expected 2 arguments, but got 1` or `not assignable to '[never]'`.
