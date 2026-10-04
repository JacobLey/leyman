---
"haywire": minor
---

Containers can now release the singletons they created. `container.disposeAsync()` (or `await using`) disposes every singleton in reverse creation order, using the instance's `Symbol.asyncDispose`/`Symbol.dispose` by default or a disposer set with `binding.withDisposer()`. Once disposed, a container rejects further requests.

Also fixes `named()`, `nullable()`, `undefinable()` and `list()` on a binding resetting its scope to transient.
