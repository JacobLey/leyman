# vitest-chain

## 0.0.5

### Patch Changes

- 7e4c3b2: `homepage` points at the package's docs site page, which the README links too.
- bc61063: Hooks must return a plain object, a `Promise` of one, or nothing. Returning an array, function, `Map`, `Set`, `Date` or `RegExp` is now a type error, and a hook that returns a class instance (or any other object whose prototype isn't `Object.prototype` or `null`) fails with `HookContextError`, rather than leaving the instance's methods typed on the context but missing from it. `test-chain-core` exports `HookContextError` and `CheckedAdditionalContext`.
- 29ba864: `beforeEach` and `afterEach` callbacks are typed with the test context alone. They were typed with a second `suite` argument, copied from vitest's types, which vitest never passes.
- 4cddf61: Document in the README the peer dependency to install, what a hook may return (only an object's own properties are merged), and the vitest features that are not wrapped.
- Updated dependencies [bc61063]
- Updated dependencies [a924b13]
  - test-chain-core@0.1.3

## 0.0.4

### Patch Changes

- ca8df5f: Require `vitest` ^5.0.3 as a peer dependency, which fixes a code injection advisory in `@vitest/mocker`.

## 0.0.3

### Patch Changes

- 15f5262: Fix README links that were broken on npm: relative links (such as WHY files and sibling packages) are now absolute, table-of-contents anchors match their headings, LICENSE badges point at the right path, and `repository` now names the package's directory in the monorepo.
- Updated dependencies [15f5262]
  - test-chain-core@0.1.1

## 0.0.2

### Patch Changes

- a7a4187: Export `EmptyContext`, the context before any hook has added to it, and use it as the initial context of every chain
- Updated dependencies [a7a4187]
  - test-chain-core@0.1.0
