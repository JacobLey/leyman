# test-chain-core

## 0.1.3

### Patch Changes

- bc61063: Hooks must return a plain object, a `Promise` of one, or nothing. Returning an array, function, `Map`, `Set`, `Date` or `RegExp` is now a type error, and a hook that returns a class instance (or any other object whose prototype isn't `Object.prototype` or `null`) fails with `HookContextError`, rather than leaving the instance's methods typed on the context but missing from it. `test-chain-core` exports `HookContextError` and `CheckedAdditionalContext`.
- a924b13: Document in the README what `createChain` returns, the `ChainNames` fields, `HookOrderError` and the exported types.

## 0.1.2

### Patch Changes

- c7757b7: When a hook runs before the hook it is chained from, hooks chained after it now also fail with `HookOrderError`, instead of waiting for its context until the framework times out.

## 0.1.1

### Patch Changes

- 15f5262: Fix README links that were broken on npm: relative links (such as WHY files and sibling packages) are now absolute, table-of-contents anchors match their headings, LICENSE badges point at the right path, and `repository` now names the package's directory in the monorepo.

## 0.1.0

### Minor Changes

- a7a4187: Export `EmptyContext`, the context before any hook has added to it, and use it as the initial context of every chain
