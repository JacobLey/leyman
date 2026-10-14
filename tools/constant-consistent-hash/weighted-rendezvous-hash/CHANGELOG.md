# weighted-rendezvous-hash

## 0.1.0

### Minor Changes

- 0a4ec52: Initial release: `createRendezvousHash(nodes, options?)` assigns keys to weighted nodes with weighted rendezvous hashing. Nodes are any set of names with integer sizes, in any order, and only their proportions matter. Adding, removing or resizing any node moves few keys: an added or grown node only takes keys, and a removed or shrunk node only gives them up. `moved(next)` gives the expected fraction of keys a change moves.

### Patch Changes

- Updated dependencies [dc55aa9]
  - constant-consistent-hash@0.1.0
