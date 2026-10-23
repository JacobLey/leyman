---
"haywire": patch
---

`factory.toContainer()` on a factory with unbound dependencies now fails with `Property 'error' is missing ... '{ error: "Error: some dependencies have no binding. ..." }'` instead of `'[]' is not assignable to 'never'`.
