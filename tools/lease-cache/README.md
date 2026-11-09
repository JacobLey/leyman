<div style="text-align:center">

# lease-cache

A read-through cache for Valkey or Redis that shares one load per key across all your servers, and handles invalidating a key while it loads.

[![npm package](https://badge.fury.io/js/lease-cache.svg)](https://www.npmjs.com/package/lease-cache)
[![License](https://img.shields.io/npm/l/lease-cache.svg)](https://github.com/JacobLey/leyman/blob/main/tools/lease-cache/LICENSE)

</div>

A read-through cache computes an "expensive" value (most likely a database query) and stores it in a cache (either memory or something like Valkey) for future reads.

Ideally the cache also makes sure two parallel reads don't run competing queries. Instead, one (or many) requests can simply wait on the single process that does the actual work, and they all share its result. Most caching libraries do this within one process, but with 20 servers the database still sees 20 queries.

`lease-cache` is a read-through cache on Valkey (or Redis) that shares that work across all of your servers. The first read to miss a key takes a "lease" on it and runs the query. Reads on any other server see the lease and wait for that value instead of querying too.

The lease also makes invalidation safe. Say a read starts its query, and before it finishes, the row is updated and you call `invalidate()`. The query may have read the old row, and in most caches that old value would now be cached until it expires. `invalidate()` removes the lease along with the value, so the read still gets its result, but doesn't cache it.

This is the same approach memcache uses at Facebook ([Scaling Memcache at Facebook](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf), section 3.2.1), implemented here with three small Lua scripts.

Some other details:

- If a query fails, its lease is freed right away so another read can try. A read that has waited `waitMs` stops waiting and runs the query itself, without caching the result.
- With `staleMs`, reads right after an invalidation can return the old value instead of waiting for the new one.
- It doesn't depend on a particular client. Anything with an `eval` command works. ioredis and iovalkey fit as they are, and node-redis and Valkey GLIDE need a few lines (see [Clients](#clients)). Keys use hash tags, so it works on a cluster too.

`lease-cache` only handles this one part of caching. It has no in-memory tier, and it doesn't refresh values in the background as they expire (stale-while-revalidate). If you need those, use it underneath a fuller cache, as the [read-through cache demo](https://github.com/JacobLey/leyman/tree/main/demos/read-through-cache) does with BentoCache.

Guides and the full reference are on the [docs site](https://jacobley.github.io/leyman/packages/lease-cache/). For more on the problem, why the guarantees hold (and what they rely on), and how `lease-cache` compares to other caches, see [WHY-LEASE-CACHE.md](https://github.com/JacobLey/leyman/blob/main/tools/lease-cache/WHY-LEASE-CACHE.md).

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

ESM only, for Node.js. It has no dependencies, so you bring your own Valkey or Redis client.

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

The cache only needs `eval`, so it works with any Valkey or Redis client. Each of the clients below is tested against Valkey.

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

**Valkey GLIDE** (`@valkey/valkey-glide`) runs scripts through `Script` objects, which it loads once and then runs by hash (`EVALSHA`). Each one has to be released, so keep one per script:

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

On a cluster, use the client's cluster mode (ioredis's `Cluster`, node-redis's `createCluster`, `GlideClusterClient`). A key's value, lease and stale value share a hash tag, so they are stored on the same node. For the tag to work, a key can't be empty or start with `}` (`LeaseCacheKeyError`), and the prefix can't contain `{` (`LeaseCachePrefixError`). Note that the tests only cover a single server.

## How it works

Each key has a value and a lease, both stored in Valkey. Every step below is one Lua script, so Valkey runs each one atomically.

1. **Read or lease.** If the value is cached, the reader returns it. Otherwise it takes the lease with a random token (`SET NX PX`), unless another reader already holds it.
2. **Fill.** The lease holder loads the value, then caches it only if the lease still holds its token, and frees the lease in the same step. Waiting readers find the value the next time they check.
3. **Invalidate** deletes the value and the lease together. With `staleMs`, it first keeps a copy of the value as stale. A load that was already running then fails the check in step 2, so what it read before the change is never cached. The next reader takes a new lease and loads the new data.

A reader that finds the lease taken checks again every `pollMs`. If a stale value is kept (see `staleMs`), it returns that right away instead. If the holder's load fails, the holder frees its lease and a waiting reader takes it over. If the holder is stuck, or has died, its lease runs out after `leaseMs`. And once a reader has waited `waitMs`, it loads the value itself and returns it without caching it, since it doesn't hold the lease.

Values are stored as JSON. `null` is cached like any other value, so a row that doesn't exist isn't looked up again on every read.

## When Valkey is down

By default, a read rejects with Valkey's error, so the cache is exactly as available as Valkey. If you pass `onUnavailable`, a read that hits a Valkey error reports it to that callback, then loads the value and returns it without caching it (`source: 'unavailable'`). Reads keep working that way, but every one of them goes to the source of truth, on every instance, until Valkey is back. If a value was already loaded when Valkey failed, it is returned rather than loaded again.

`invalidate()` rejects either way. If an invalidation didn't happen, the old value is still cached once Valkey comes back, so the caller needs to know.

To keep caching through an outage, put a cache in front that keeps values in memory for a short time when `get` rejects. The [read-through cache demo](https://github.com/JacobLey/leyman/tree/main/demos/read-through-cache) does this.

## API

### `new LeaseCache(options)`

| Option          | Type                                    | Description                                                                                                                                                                                                                                                                |
| --------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection`    | `LeaseCacheConnection`                  | Required. Anything with `eval(script, numKeys, ...args)` (see [Clients](#clients)). The cache doesn't close it.                                                                                                                                                            |
| `prefix`        | `string`                                | Required. Prefix of every key, so several caches can share a server. Must not contain `{`.                                                                                                                                                                                 |
| `ttlMs`         | `number`                                | Required. How long a loaded value is cached, unless `get` is given its own.                                                                                                                                                                                                |
| `leaseMs`       | `number`                                | Required. How long a reader may load before another can take over. Set it longer than a load usually takes. A load that outlives its lease still returns, but caches nothing.                                                                                              |
| `pollMs`        | `number`                                | Required. How often a waiting reader checks again.                                                                                                                                                                                                                         |
| `waitMs`        | `number`                                | Required. How long a reader waits on another's load before loading itself (without caching).                                                                                                                                                                               |
| `staleMs`       | `number`                                | Optional, `0` (off) by default. After `invalidate()`, how long the old value is kept as stale. A reader that would wait on another's load returns it instead. Only for reads that accept data from before the last change, since a stale value is returned but not cached. |
| `onWait`        | `(key: string) => void`                 | Optional. Called once for each read that waits on another's load, e.g. to count saved loads.                                                                                                                                                                               |
| `onUnavailable` | `(error: unknown, key: string) => void` | Optional. Called when Valkey fails. Given, reads load without caching rather than reject, so they keep working while Valkey is down.                                                                                                                                       |

Durations are rounded up to whole milliseconds. Each must be a finite number above 0 (`waitMs` and `staleMs` may be 0), or the constructor throws `LeaseCacheDurationError`.

#### `cache.get(key, load, options?)`

Returns the cached value, or calls `load` and caches what it returns. If `load` throws, `get` rejects with that error.

Loaded values must be JSON. A value with a `Date`, a function or `undefined` in it is a type error, because `JsonValue<T>` maps each of those to `never`. Interfaces and type aliases both work. If a loader returns `undefined` anyway, `get` rejects with `LeaseCacheValueError` and caches nothing.

`options.ttlMs` sets how long this value is cached, in place of the cache's `ttlMs`. It can be a function of the loaded value, for example to cache a missing row for less time than a found one:

```ts
const user = await cache.get(`user:${id}`, async () => db.users.find(id), {
    ttlMs: found => (found ? 60_000 : 5000),
});
```

#### `cache.read(key, load, options?)`

Works like `get`, but returns `{ value, source, ttlMs }`, which says where the value came from and how much longer Valkey will cache it. It is meant for a cache in front of this one, such as a memory tier. That cache should keep a value no longer than `ttlMs`, and not at all when it is `0`, since a value Valkey didn't cache may already be outdated.

| `source`        | The value                                                                                | `ttlMs`               |
| --------------- | ---------------------------------------------------------------------------------------- | --------------------- |
| `'hit'`         | Was cached already.                                                                      | The time it has left. |
| `'filled'`      | Was loaded with the lease, and cached.                                                   | The value's `ttlMs`.  |
| `'lost'`        | Was loaded, but the lease was lost first (invalidated, or run out), so it wasn't cached. | `0`                   |
| `'stale'`       | Was kept by an invalidation (`staleMs`), and returned rather than waiting.               | `0`                   |
| `'timeout'`     | Was loaded without a lease, after waiting `waitMs`.                                      | `0`                   |
| `'unavailable'` | Was loaded without the cache, as Valkey failed. Only with `onUnavailable`.               | `0`                   |

#### `cache.invalidate(key)`

Deletes the value, so the next read loads it again. A load that is already running still returns to its caller, but caches nothing. Call it after the source of truth changes. It rejects when Valkey fails, even with `onUnavailable`, because the value would otherwise still be cached once Valkey is back.

The guarantee assumes that loads read current data. A load from a lagging replica can still read the old data after the invalidation. See [why it is correct](https://github.com/JacobLey/leyman/blob/main/tools/lease-cache/WHY-LEASE-CACHE.md#why-it-is-correct).

### Errors

Every error extends `LeaseCacheError`. Whatever `load` throws is passed on unchanged.

| Error                     | When                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `LeaseCacheDurationError` | A duration isn't a finite number above 0 (`waitMs` and `staleMs` may be 0), including one computed by `ttlMs`. Has `option` and `value`. |
| `LeaseCacheKeyError`      | A key is empty or starts with `}`, so its hash tag would be empty (see [Clients](#clients)). Has `key`.                                  |
| `LeaseCachePrefixError`   | The prefix contains `{`, which would change the keys' hash tag. Has `prefix`.                                                            |
| `LeaseCacheValueError`    | `load` returned something JSON can't store, e.g. `undefined`. Has `key`.                                                                 |

## Compared to alternatives

|                                                            | lease-cache          | BentoCache, cache-manager, cachified |
| ---------------------------------------------------------- | -------------------- | ------------------------------------ |
| Concurrent misses across instances                         | one load             | one per instance                     |
| Load finishing after an invalidation                       | not cached           | cached until it expires              |
| Readers waiting on a load after an invalidation            | optional (`staleMs`) | ✅ (grace periods)                   |
| Memory tier, stale-while-revalidate on expiry, many stores | ❌                   | ✅                                   |

See [WHY-LEASE-CACHE.md](https://github.com/JacobLey/leyman/blob/main/tools/lease-cache/WHY-LEASE-CACHE.md#compared-to-alternatives) for the full comparison.
