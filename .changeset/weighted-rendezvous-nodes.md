---
"weighted-rendezvous-hash": minor
---

Initial release: `createRendezvousHash(nodes, options?)` assigns keys to weighted nodes with weighted rendezvous hashing. Nodes are any set of names with integer sizes, in any order, and only their proportions matter. Adding, removing or resizing any node moves few keys: an added or grown node only takes keys, and a removed or shrunk node only gives them up. `moved(next)` gives the expected fraction of keys a change moves.
