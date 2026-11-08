# weighted-rendezvous-hash

## 0.2.1

### Patch Changes

- a66d307: Require Node.js 22.12.0 or later (`engines.node` was `>=22`). 22.12.0 is the oldest Node.js where the test runner starts, since mocha needs `require()` of ES modules, so it is the oldest version the package is tested on. Nothing changed for Node.js 22.12 and later.
- Updated dependencies [a66d307]
  - constant-consistent-hash@0.2.2

## 0.2.0

### Minor Changes

- 8461cca: Supports Node.js 22: `engines.node` is now `>=22`, down from `>=24`. The package uses no API newer than Node.js 22 has, and is built and tested against it.

### Patch Changes

- Updated dependencies [8461cca]
  - constant-consistent-hash@0.2.0

## 0.1.2

### Patch Changes

- 37616d3: Document the size limit, the errors from `update`, and the module format in the README.

## 0.1.1

### Patch Changes

- d022dff: `moved(next)` throws a `TypeError` that says what's wrong when `next` wasn't built by `createRendezvousHash`, such as a hash from another installed copy of the package. It used to fail with "Cannot read properties of undefined".

## 0.1.0

### Minor Changes

- 0a4ec52: Initial release: `createRendezvousHash(nodes, options?)` assigns keys to weighted nodes with weighted rendezvous hashing. Nodes are any set of names with integer sizes, in any order, and only their proportions matter. Adding, removing or resizing any node moves few keys: an added or grown node only takes keys, and a removed or shrunk node only gives them up. `moved(next)` gives the expected fraction of keys a change moves.

### Patch Changes

- Updated dependencies [dc55aa9]
  - constant-consistent-hash@0.1.0
