<div style="text-align:center">

# lease-cache
Read-through caching on Valkey or Redis with leases: one load per key across every instance, and a load that finishes after an invalidation never caches its outdated value.

[![npm package](https://badge.fury.io/js/lease-cache.svg)](https://www.npmjs.com/package/lease-cache)
[![License](https://img.shields.io/npm/l/lease-cache.svg)](https://github.com/JacobLey/leyman/blob/main/tools/lease-cache/LICENSE)

</div>

- **One load per key, across every instance**: the first reader to miss takes a lease and loads. Readers on any other process wait for its value instead of loading too.
- **No outdated values after an invalidation**: a load that started before `invalidate()` (and may have read the data from before the change) returns to its caller, but can't cache what it read. Most read-through caches would keep that value until it expires.
- **A failed or stuck load holds no one up for long**: a failed load frees its lease right away, and readers stop waiting after `waitMs`.
- **Optionally, no waiting after an invalidation**: with `staleMs`, the invalidated value is kept as stale, and readers that would wait on the next load return it instead.
- **No client dependency**: anything with an `eval` command works. ioredis and iovalkey fit as they are, and node-redis and Valkey GLIDE need a few lines (see [Clients](#clients)). Keys use hash tags, so it works on a cluster.

Leases are the mechanism memcache uses at Facebook ([Scaling Memcache at Facebook](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf), section 3.2.1), done here with three small Lua scripts. It covers one part of a cache: no memory tier or stale-while-revalidate on expiry, so pair it with a fuller cache when you need those.

Guides and the full reference are on the [docs site](https://jacobley.github.io/leyman/packages/lease-cache/). For the problem in detail, why the guarantees hold (and what they rely on), and the comparison to other caches, see [WHY-LEASE-CACHE.md](https://github.com/JacobLey/leyman/blob/main/tools/lease-cache/WHY-LEASE-CACHE.md).

## Contents
- [Install](#install)
- [Example](#example)
- [Clients](#clients)
- [How it works](#how-it-works)
- [When Valkey is down](#when-valkey-is-down)
- [API](#api)
  - [LeaseCache](#new-leasecacheoptions)
  - [Errors](#errors)
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

## Clients

The cache only needs `eval`, so it works with any Valkey or Redis client. Each of these is tested against Valkey.

**ioredis** and **iovalkey** (the Valkey community's fork of ioredis) fit as they are, `Redis` and `Cluster` alike:

```ts
import { Redis } from 'iovalkey'; // or 'ioredis'

const connection = new Redis('redis://valkey:6379');
```

**node-redis** (`redis`) takes keys and arguments in an options object:

```ts
import type { LeaseCacheConnection } from 'lease-cache';
import { createClient } from 'redis';

const client = await createClient({ url: 'redis://valkey:6379' }).connect();
const connection: LeaseCacheConnection = {
    eval: async (script, numKeys, ...args) => {
        const strings = args.map(String);
        return client.eval(script, {
            keys: strings.slice(0, numKeys),
            arguments: strings.slice(numKeys),
        });
    },
};
```

**Valkey GLIDE** (`@valkey/valkey-glide`) runs scripts through `Script` objects, which it loads once and then runs by hash (`EVALSHA`). Keep one per script, since each must be released:

```ts
import { GlideClient, Script } from '@valkey/valkey-glide';
import type { LeaseCacheConnection } from 'lease-cache';

const client = await GlideClient.createClient({ addresses: [{ host: 'valkey', port: 6379 }] });
// lease-cache uses a handful of fixed scripts, so these live as long as the client
const scripts = new Map<string, Script>();
const connection: LeaseCacheConnection = {
    eval: async (code, numKeys, ...args) => {
        let script = scripts.get(code);
        if (!script) {
            script = new Script(code);
            scripts.set(code, script);
        }
        const strings = args.map(String);
        return client.invokeScript(script, {
            keys: strings.slice(0, numKeys),
            args: strings.slice(numKeys),
        });
    },
};
```

On a cluster, use the client's cluster mode (ioredis's `Cluster`, node-redis's `createCluster`, `GlideClusterClient`): each key's value, lease and stale value share a hash tag, so they live on the same node. For the tag to work, a key can't be empty or start with `}` (`LeaseCacheKeyError`), and the prefix can't contain `{` (`LeaseCachePrefixError`). The tests only cover a single server.

## How it works

Each key has a value and a lease, both in Valkey. Every step is one Lua script, so each runs atomically:

1. **Read or lease.** If the value is cached, return it. Otherwise take the lease with a random token (`SET NX PX`), or report that another reader holds it.
2. **Fill.** The lease holder loads the value, then caches it only if the lease still holds its token, freeing the lease in the same step. Waiting readers find the value on their next check.
3. **Invalidate** deletes the value and the lease together (keeping the value as stale first, with `staleMs`). A load already in progress then fails the check in step 2, so what it read before the change is never cached. The next reader takes a new lease and loads the new data.

A reader that finds the lease taken checks again every `pollMs`, unless a stale value is kept (see `staleMs`), which it returns right away. If the holder's load fails, it frees its lease, and a waiting reader takes it. If the holder is stuck (or died), its lease runs out after `leaseMs`. After `waitMs`, a reader loads anyway, and returns the value without caching it, since it holds no lease.

Values are stored as JSON. `null` is cached like any other value, so a missing row isn't looked up again on every read.

## When Valkey is down

By default, a read rejects with Valkey's error, so the cache is exactly as available as Valkey. With `onUnavailable`, a read that hits a Valkey error reports it and loads the value without caching it (`source: 'unavailable'`): reads keep working, but every one of them reaches the source of truth, on every instance, until Valkey is back. A value loaded just before Valkey failed is returned, rather than loaded again.

`invalidate()` rejects either way. An invalidation that didn't happen leaves the old value cached once Valkey is back, so the caller has to know.

To keep caching through an outage, put a cache in front that keeps values in memory for a short time when `get` rejects, as the [read-through cache demo](https://github.com/JacobLey/leyman/tree/main/demos/read-through-cache) does.

## API

### `new LeaseCache(options)`

| Option | Type | Description |
|--------|------|-------------|
| `connection` | `LeaseCacheConnection` | Required. Anything with `eval(script, numKeys, ...args)`: see [Clients](#clients). Never closed by the cache. |
| `prefix` | `string` | Required. Prefix of every key, so several caches can share a server. Must not contain `{`. |
| `ttlMs` | `number` | Required. How long a loaded value is cached, unless `get` is given its own. |
| `leaseMs` | `number` | Required. How long a reader may load before another can take over. Longer than a load usually takes: a load that outlives its lease still returns, but caches nothing. |
| `pollMs` | `number` | Required. How often a waiting reader checks again. |
| `waitMs` | `number` | Required. How long a reader waits on another's load before loading itself (without caching). |
| `staleMs` | `number` | Optional, `0` (off) by default. After `invalidate()`, how long the old value is kept as stale. A reader that would wait on another's load returns it instead. Only for reads that accept data from before the last change: a stale value is returned, never cached. |
| `onWait` | `(key: string) => void` | Optional. Called once for each read that waits on another's load, e.g. to count saved loads. |
| `onUnavailable` | `(error: unknown, key: string) => void` | Optional. Called when Valkey fails. Given, reads load without caching rather than reject, so they keep working while Valkey is down. |

Durations are rounded up to whole milliseconds. Each must be a finite number above 0 (`waitMs` and `staleMs` may be 0), or the constructor throws `LeaseCacheDurationError`.

#### `cache.get(key, load, options?)`

Returns the cached value, or calls `load` and caches what it returns. Rejects with what `load` threw. `T` must be JSON (`JsonValue<T>`): a loader that returns `undefined` anyway rejects with `LeaseCacheValueError`, caching nothing.

Loaded values must be JSON: a value with a `Date`, a function or `undefined` is a type error (`JsonValue<T>` maps each to `never`). Interfaces and type aliases both work.

`options.ttlMs` caches this value for its own time, in place of the cache's `ttlMs`. A function gets the loaded value, e.g. to cache a missing row for less time than a found one:

```ts
const user = await cache.get(`user:${id}`, async () => db.users.find(id), {
    ttlMs: found => (found ? 60_000 : 5000),
});
```

#### `cache.read(key, load, options?)`

As `get`, but returns `{ value, source, ttlMs }`: where the value came from, and how much longer Valkey caches it. For a cache in front of this one, such as a memory tier: it should keep a value no longer than `ttlMs`, and not at all at `0`, since a value Valkey didn't cache may already be outdated.

| `source` | The value | `ttlMs` |
|---|---|---|
| `'hit'` | Was cached already. | The time it has left. |
| `'filled'` | Was loaded with the lease, and cached. | The value's `ttlMs`. |
| `'lost'` | Was loaded, but the lease was lost first (invalidated, or run out), so it wasn't cached. | `0` |
| `'stale'` | Was kept by an invalidation (`staleMs`), and returned rather than waiting. | `0` |
| `'timeout'` | Was loaded without a lease, after waiting `waitMs`. | `0` |
| `'unavailable'` | Was loaded without the cache, as Valkey failed. Only with `onUnavailable`. | `0` |

#### `cache.invalidate(key)`

Deletes the value, so the next read loads it. A load already in progress returns to its caller, but caches nothing. Call it after the source of truth changes. Rejects when Valkey fails, even with `onUnavailable`: the value would still be cached once Valkey is back.

The guarantee relies on loads reading current data: a load from a lagging replica can still read the old data after the invalidation. See [why it is correct](https://github.com/JacobLey/leyman/blob/main/tools/lease-cache/WHY-LEASE-CACHE.md#why-it-is-correct).

### Errors

Every error extends `LeaseCacheError`. What `load` throws is passed on as it is.

| Error | When |
|-------|------|
| `LeaseCacheDurationError` | A duration isn't a finite number above 0 (`waitMs` and `staleMs` may be 0), including one computed by `ttlMs`. Has `option` and `value`. |
| `LeaseCacheKeyError` | A key is empty or starts with `}`, so its hash tag would be empty (see [Clients](#clients)). Has `key`. |
| `LeaseCachePrefixError` | The prefix contains `{`, which would change the keys' hash tag. Has `prefix`. |
| `LeaseCacheValueError` | `load` returned something JSON can't store, e.g. `undefined`. Has `key`. |

## Compared to alternatives

| | lease-cache | BentoCache, cache-manager, cachified |
|---|---|---|
| Concurrent misses across instances | one load | one per instance |
| Load finishing after an invalidation | not cached | cached until it expires |
| Readers waiting on a load after an invalidation | optional (`staleMs`) | ✅ (grace periods) |
| Memory tier, stale-while-revalidate on expiry, many stores | ❌ | ✅ |

See [WHY-LEASE-CACHE.md](https://github.com/JacobLey/leyman/blob/main/tools/lease-cache/WHY-LEASE-CACHE.md#compared-to-alternatives) for the full comparison.
