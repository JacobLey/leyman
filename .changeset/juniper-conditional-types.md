---
"juniper": patch
---

Type the `if`, `then` and `else` keywords of `JsonSchema` as `JsonSchema<unknown>`, not `JsonSchema<any>`, so reading them no longer opts out of type checking.
