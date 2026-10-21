<div style="text-align:center">

# weighted-rendezvous-hash
Weighted rendezvous hashing: any set of nodes, in any order, sized by proportion, moving few keys when the set changes.

[![npm package](https://badge.fury.io/js/weighted-rendezvous-hash.svg)](https://www.npmjs.com/package/weighted-rendezvous-hash)
[![License](https://img.shields.io/npm/l/weighted-rendezvous-hash.svg)](https://github.com/JacobLey/leyman/blob/main/tools/constant-consistent-hash/weighted-rendezvous-hash/LICENSE)

</div>

- **Any set of nodes**: add, remove or resize any node, not just the last one. Nodes are identified by name, in any order.
- **Weighted by proportion**: every key goes to a node with probability size / total size, exactly. Sizes of 1, 2 and 3 assign keys the same as 1000, 2000 and 3000.
- **Few keys move**: an added or grown node only takes keys, a removed or shrunk node only gives them up. Resizing several nodes at once moves less than twice the minimum, and `moved()` says exactly how many to expect.
- **Stateless**: the result only depends on the nodes given. There is no ring or table to build, and no history to keep in sync between clients.

Lookups take time in proportion to the number of nodes, about 1µs for 100 nodes. For nodes numbered `0` to `n - 1` that are only added and removed at the end, [constant-consistent-hash](https://www.npmjs.com/package/constant-consistent-hash) takes constant time, and moves the minimum number of keys.

## Contents
- [Install](#install)
- [Example](#example)
- [API](#api)
  - [createRendezvousHash](#createrendezvoushashnodes-options)
- [Compared to alternatives](#compared-to-alternatives)

## Install

```sh
npm i weighted-rendezvous-hash
```

## Example

```ts
import { createRendezvousHash } from 'weighted-rendezvous-hash';

const nodes = createRendezvousHash([
    { name: 'a', size: 1, host: 'a.example.com' },
    { name: 'b', size: 2, host: 'b.example.com' },
]);

nodes.get('00000000-0000-4000-8000-000000000000').host; // 'a.example.com'

// Add a node anywhere: keys only move to 'ab'
const next = nodes.update([
    { name: 'a', size: 1, host: 'a.example.com' },
    { name: 'ab', size: 1, host: 'ab.example.com' },
    { name: 'b', size: 2, host: 'b.example.com' },
]);
nodes.moved(next); // 0.25, the share 'ab' takes
```

## API

### `createRendezvousHash(nodes, options?)`

Builds an assignment of keys to nodes.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `nodes` | `Iterable<{ name: string; size: number }>` | — | Required. Nodes in any order, with unique names. Sizes are non-negative integers, and at least one must be positive. A node of size `0` receives no keys. Extra properties are kept, and returned by `get`. |
| `options.seed` | `number` | `0` | Integer between 0 and 2^32 - 1 that selects an independent hash function. |

**Returns** `RendezvousHash`:

| Member | Description |
|--------|-------------|
| `get(key)` | The node for a key (hashed as UTF-8). The same object given in `nodes`. |
| `nodes` | Nodes with a positive size, sorted by name. |
| `share(name)` | Fraction of keys assigned to a node: its size / total size. |
| `moved(next)` | Expected fraction of keys `next` assigns to a different node. `next` must come from `createRendezvousHash` (or `update`) of the same installed copy of this package, or it throws `TypeError`. |
| `update(nodes)` | Builds the assignment for new nodes, with the same options. |

**Throws** `RangeError` — when names repeat, sizes or the seed are out of bounds, or no node has a positive size.

## Compared to alternatives

| | weighted-rendezvous-hash | Hash ring ([hashring](https://www.npmjs.com/package/hashring)) | [constant-consistent-hash](https://www.npmjs.com/package/constant-consistent-hash) |
|---|---|---|---|
| Lookup | O(n) | O(log n) | O(1) |
| Memory | nodes | virtual nodes | none |
| Change any node | ✅ | ✅ | ❌ (end only) |
| Keys moved | < 2x minimal, predicted by `moved()` | ~minimal, up to ~2x on resizes | minimal |
| Balance | exact | depends on virtual nodes | exact |

A hash ring looks keys up faster with many nodes, but needs many virtual nodes per node to balance evenly.
