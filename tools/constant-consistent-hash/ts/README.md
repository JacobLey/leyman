<div style="text-align:center">

# constant-consistent-hash

Stateless consistent hashing in constant time with no loops, which only moves keys into a newly added bucket. Specified so any language can return the same buckets.

[![npm package](https://badge.fury.io/js/constant-consistent-hash.svg)](https://www.npmjs.com/package/constant-consistent-hash)
[![License](https://img.shields.io/npm/l/constant-consistent-hash.svg)](https://github.com/JacobLey/leyman/blob/main/tools/constant-consistent-hash/ts/LICENSE)

</div>

Spreading keys across buckets (database shards, cache nodes, workers) with `hash(key) % n` balances well, but adding a bucket moves almost every key. A consistent hash keeps the buckets balanced while moving as few keys as possible. Going from `n` to `n + 1` buckets, only the `1/(n + 1)` of keys the new bucket needs should move, and all of them into that new bucket.

`constant-consistent-hash` does this with a fixed amount of work per lookup, whatever the number of buckets (up to 2^48). Jump hash also needs no stored state, but it loops, which makes a lookup O(log n). Power consistent hashing and JumpBackHash are constant time on average, but still loop a number of times that depends on the key, where this package doesn't loop at all.

A lookup only needs the key and the bucket count, so there is no ring or table to build, store or keep in sync. Every bucket is equally likely, without virtual nodes or any tuning.

The algorithm is specified over UTF-8 bytes and 32-bit integer operations, with test vectors, so other languages can produce the same buckets.

Buckets can only be added and removed at the end, so it doesn't suit removing an arbitrary bucket from the middle. The key hash is fast rather than cryptographic, so it isn't meant for keys chosen by an attacker either. For the design and the full comparison, see [WHY-CONSTANT-CONSISTENT-HASH.md](https://github.com/JacobLey/leyman/blob/main/tools/constant-consistent-hash/ts/WHY-CONSTANT-CONSISTENT-HASH.md).

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [consistentHash](#consistenthashkey-range-options)
  - [hashKey](#hashkeykey-options)
- [Other languages](#other-languages)
- [Compared to alternatives](#compared-to-alternatives)

## Install

```sh
npm i constant-consistent-hash
```

## Example

```ts
import { consistentHash } from 'constant-consistent-hash';

const shard = consistentHash('00000000-0000-4000-8000-000000000000', 7);
// 2

// Adding an 8th shard either leaves the key where it was, or moves it to shard 7
consistentHash('00000000-0000-4000-8000-000000000000', 8);
```

## Usage

`constant-consistent-hash` is an ESM module with no dependencies, and works in Node.js and browsers. To load from a CommonJS module, use dynamic import: `const { consistentHash } = await import('constant-consistent-hash');`.

Buckets are numbered `0` to `range - 1`. Add buckets at the end, and remove them from the end. The keys in a removed bucket are spread across the rest, and no other key moves. To take a bucket out of the middle, keep the range and map that bucket number to a replacement in your own code.

Keys are hashed with a fast non-cryptographic hash. It distributes self-generated keys such as UUIDs evenly, but someone who can choose keys can deliberately put them all in one bucket.

## API

### `consistentHash(key, range, options?)`

Maps a key to a bucket.

**Parameters**

| Parameter      | Type                    | Default | Description                                                               |
| -------------- | ----------------------- | ------- | ------------------------------------------------------------------------- |
| `key`          | `string`                | —       | Required. Value to be hashed, as UTF-8.                                   |
| `range`        | `number`                | —       | Required. Number of buckets, an integer between 1 and 2^48.               |
| `options`      | `ConsistentHashOptions` | `{}`    | Optional.                                                                 |
| `options.seed` | `number`                | `0`     | Integer between 0 and 2^32 - 1 that selects an independent hash function. |

**Returns** `number` — bucket between `0` and `range - 1`.

**Throws** `RangeError` — when `range` or `seed` is not an integer within its bounds.

```ts
consistentHash('00000000-0000-4000-8000-000000000000', 100); // 72
```

#### Seeds

Hashing the same keys at several layers with the same function correlates the layers. For example, every key in shard 3 of 8 would also land in the same few nodes within that shard. Give each layer its own seed:

```ts
const shard = consistentHash(key, shardCount, { seed: 1 });
const node = consistentHash(key, nodesPerShard, { seed: 2 });
```

Changing the seed moves almost every key, so a seed is fixed for the lifetime of the data it places. It is not a secret, and does not stop crafted keys from targeting a bucket.

### `hashKey(key, options?)`

Returns the hash `consistentHash` places a key with, as two independent unsigned 32-bit integers computed from the key's UTF-8 bytes. Use it to build other hashing schemes, such as [weighted-rendezvous-hash](https://www.npmjs.com/package/weighted-rendezvous-hash), with the same results in every language that implements SPEC.md.

| Parameter      | Type     | Default | Description                                                               |
| -------------- | -------- | ------- | ------------------------------------------------------------------------- |
| `key`          | `string` | —       | Required. Value to be hashed, as UTF-8.                                   |
| `options.seed` | `number` | `0`     | Integer between 0 and 2^32 - 1 that selects an independent hash function. |

**Returns** `readonly [number, number]`.

**Throws** `RangeError` — when `seed` is not an integer within its bounds.

```ts
hashKey('00000000-0000-4000-8000-000000000000'); // [865118427, 3574204183]
```

Like `consistentHash`, it is fast but not cryptographic.

## Other languages

[SPEC.md](https://github.com/JacobLey/leyman/blob/main/tools/constant-consistent-hash/ts/SPEC.md) describes the algorithm step by step, in terms any language can implement exactly, along with test vectors. A [Go implementation](https://github.com/JacobLey/leyman/tree/main/tools/constant-consistent-hash/go), written from the specification, is tested against the same vectors, as is a [Rust implementation](https://github.com/JacobLey/leyman/tree/main/tools/constant-consistent-hash/rust). Neither is published. This package implements version 1.0 of the specification, exported as `SPEC_VERSION`.

## Compared to alternatives

|                                 | constant-consistent-hash | Modulo (`hash % n`) | Hash ring                 | Rendezvous (HRW) | Jump hash | Power CH / JumpBackHash |
| ------------------------------- | ------------------------ | ------------------- | ------------------------- | ---------------- | --------- | ----------------------- |
| Time per lookup                 | O(1), no loops           | O(1)                | O(log n)                  | O(n)             | O(log n)  | O(1) on average         |
| Keys moved when adding a bucket | 1/(n + 1)                | almost all          | ~1/(n + 1), with variance | 1/(n + 1)        | 1/(n + 1) | 1/(n + 1)               |
| Memory                          | none                     | none                | ring of virtual nodes     | list of nodes    | none      | none                    |
| Remove any bucket               | ❌                       | ❌                  | ✅                        | ✅               | ❌        | ❌                      |

See the [WHY file](https://github.com/JacobLey/leyman/blob/main/tools/constant-consistent-hash/ts/WHY-CONSTANT-CONSISTENT-HASH.md#compared-to-alternatives) for the full comparison.
