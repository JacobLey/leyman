<div style="text-align:center">

# lease-cache
Read-through caching on Valkey or Redis with leases: one load per key across every instance, and a load that finishes after an invalidation never caches its outdated value.

[![npm package](https://badge.fury.io/js/lease-cache.svg)](https://www.npmjs.com/package/lease-cache)
[![License](https://img.shields.io/npm/l/lease-cache.svg)](https://github.com/JacobLey/leyman/blob/main/tools/lease-cache/LICENSE)

</div>

- **One load per key, across every instance**: the first reader to miss takes a lease and loads. Readers on any other process wait for its value instead of loading too.
- **No outdated values after an invalidation**: a load that started before `invalidate()` (and may have read the data from before the change) returns to its caller, but can't cache what it read. Most read-through caches would keep that value until it expires.
- **A failed or stuck load holds no one up for long**: a failed load frees its lease right away, and readers stop waiting after `waitMs`.
- **No client dependency**: anything with an `eval` command works, such as an ioredis `Redis` or `Cluster`. Keys use hash tags, so it works on a cluster.

Leases are the mechanism memcache uses at Facebook ([Scaling Memcache at Facebook](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf), section 3.2.1), done here with three small Lua scripts. It is the narrow part of a cache, not a whole one: no memory tier or stale-while-revalidate, so pair it with a fuller cache when you need those.

For the problem in detail, why the guarantees hold (and what they rely on), and the comparison to other caches, see [WHY-LEASE-CACHE.md](https://github.com/JacobLey/leyman/blob/main/tools/lease-cache/WHY-LEASE-CACHE.md).

## Contents
- [Install](#install)
- [Example](#example)
- [How it works](#how-it-works)
- [API](#api)
  - [LeaseCache](#new-leasecacheoptions)
- [Compared to alternatives](#compared-to-alternatives)

## Install

```sh
npm i lease-cache
```

ESM only, for Node.js. It has no dependencies: bring your own Valkey or Redis client.

## Example

```ts
import { Redis } from 'ioredis';
import { LeaseCache } from 'lease-cache';

const cache = new LeaseCache({
    connection: new Redis('redis://valkey:6379'),
    prefix: 'users',
    ttlMs: 60_000,
    leaseMs: 5000,
    pollMs: 50,
    waitMs: 2000,
});

const user = await cache.get(`user:${id}`, async () => db.users.find(id));

// After updating the user
await db.users.update(id, changes);
await cache.invalidate(`user:${id}`);
```

## How it works

Each key has a value and a lease, both in Valkey. Every step is one Lua script, so each runs atomically:

1. **Read or lease.** If the value is cached, return it. Otherwise take the lease with a random token (`SET NX PX`), or report that another reader holds it.
2. **Fill.** The lease holder loads the value, then caches it only if the lease still holds its token, freeing the lease in the same step. Waiting readers find the value on their next check.
3. **Invalidate** deletes the value and the lease together. A load already in progress then fails the check in step 2, so what it read before the change is never cached. The next reader takes a new lease and loads the new data.

A reader that finds the lease taken checks again every `pollMs`. If the holder's load fails, it frees its lease, and a waiting reader takes it. If the holder is stuck (or died), its lease runs out after `leaseMs`. After `waitMs`, a reader loads anyway, and returns the value without caching it, since it holds no lease.

Values are stored as JSON. `null` is cached like any other value, so a missing row isn't looked up again on every read.

## API

### `new LeaseCache(options)`

| Option | Type | Description |
|--------|------|-------------|
| `connection` | `LeaseCacheConnection` | Required. Anything with `eval(script, numKeys, ...args)`, such as an ioredis `Redis` or `Cluster`. Never closed by the cache. |
| `prefix` | `string` | Required. Prefix of every key, so several caches can share a server. |
| `ttlMs` | `number` | Required. How long a loaded value is cached. |
| `leaseMs` | `number` | Required. How long a reader may load before another can take over. Longer than a load usually takes: a load that outlives its lease still returns, but caches nothing. |
| `pollMs` | `number` | Required. How often a waiting reader checks again. |
| `waitMs` | `number` | Required. How long a reader waits on another's load before loading itself (without caching). |
| `onWait` | `(key: string) => void` | Optional. Called each time a reader waits on another's load, e.g. to count saved loads. |

#### `cache.get(key, load)`

Returns the cached value, or calls `load` and caches what it returns. Rejects with what `load` threw. `T` must be JSON (`Json`).

#### `cache.invalidate(key)`

Deletes the value, so the next read loads it. A load already in progress returns to its caller, but caches nothing. Call it after the source of truth changes.

The guarantee relies on loads reading current data: a load from a lagging replica can still read the old data after the invalidation. See [why it is correct](https://github.com/JacobLey/leyman/blob/main/tools/lease-cache/WHY-LEASE-CACHE.md#why-it-is-correct).

## Compared to alternatives

| | lease-cache | BentoCache, cache-manager, cachified |
|---|---|---|
| Concurrent misses across instances | one load | one per instance |
| Load finishing after an invalidation | not cached | cached until it expires |
| Memory tier, stale-while-revalidate, many stores | ❌ | ✅ |

See [WHY-LEASE-CACHE.md](https://github.com/JacobLey/leyman/blob/main/tools/lease-cache/WHY-LEASE-CACHE.md#compared-to-alternatives) for the full comparison.
