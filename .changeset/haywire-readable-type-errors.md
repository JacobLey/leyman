---
"haywire": patch
---

Type errors now say what is wrong, e.g. `{ error: "Error: an output is already bound. Use replaceBinding() on a module to swap it." }`, for module bindings, `toContainer()`/`createContainer()`, `container.get()`/`getAsync()` and `factory.bindInstance()`, instead of `'[]' is not assignable to 'never'` or `not assignable to 'IsClass'`.

`module.toContainer()` now rejects a module with unbound dependencies at compile time, like `createContainer(module)` already did.
