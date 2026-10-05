# test-chain-core

## 0.1.1

### Patch Changes

- 15f5262: Fix README links that were broken on npm: relative links (such as WHY files and sibling packages) are now absolute, table-of-contents anchors match their headings, LICENSE badges point at the right path, and `repository` now names the package's directory in the monorepo.

## 0.1.0

### Minor Changes

- a7a4187: Export `EmptyContext`, the context before any hook has added to it, and use it as the initial context of every chain
