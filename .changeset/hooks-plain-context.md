---
"test-chain-core": patch
"mocha-chain": patch
"vitest-chain": patch
---

Hooks must return a plain object, a `Promise` of one, or nothing. Returning an array, function, `Map`, `Set`, `Date` or `RegExp` is now a type error, and a hook that returns a class instance (or any other object whose prototype isn't `Object.prototype` or `null`) fails with `HookContextError`, rather than leaving the instance's methods typed on the context but missing from it. `test-chain-core` exports `HookContextError` and `CheckedAdditionalContext`.
