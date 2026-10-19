---
"haywire": patch
---

More compile errors say what is wrong: a `named()` name that isn't a literal, dependencies that don't match a provider, async providers of a `Promise`, `withConstructorFactory()`/`withConstructorProvider()` on an identifier whose class doesn't fit, and `identifier()` with an invalid type and a name or class. They fail with `Property 'error' is missing ... '{ error: "Error: ..." }'` instead of `'[]' is not assignable to 'never'` or `Expected N arguments`.
