---
description: LeaseCache, its options, get, read and invalidate, its errors, and the Json and LeaseCacheConnection types.
---

# API

## `new LeaseCache(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `connection` | [`LeaseCacheConnection`](#leasecacheconnection) | — | Runs the cache's scripts. See [Clients](/lease-cache/guides/clients). Never closed by the cache. |
| `prefix` | `string` | — | Prefix of every key, so several caches can share a server. |
| `ttlMs` | `number` | — | How long a loaded value is cached, in milliseconds, unless [`get`](#cache-get-key-load-options) is given its own. |
| `leaseMs` | `number` | — | How long a reader may load before another can take over. Longer than a load usually takes: a load that outlives its lease still returns, but caches nothing. |
| `pollMs` | `number` | — | How often a reader waiting on another's load checks again. |
| `waitMs` | `number` | — | How long a reader waits on another's load before loading itself. It then caches nothing, as it holds no lease. Bounds how long a stuck load can stall everyone else. |
| `staleMs` | `number` | `0` (off) | After `invalidate()`, how long the old value is kept as stale. A reader that would wait on another's load returns it instead. See [Serving stale values](/lease-cache/guides/invalidation#serving-stale-values-while-the-next-load-runs). |
| `onWait` | `(key: string) => void` | — | Called once for each read that finds another reader loading the key, and waits on it. For example, to count the loads that leases saved. |
| `onUnavailable` | `(error: unknown, key: string) => void` | — | Called when Valkey fails. Given, a read loads the value without caching it rather than reject, so reads keep working while Valkey is down. See [`read`](#cache-read-key-load-options). |

Durations are rounded up to whole milliseconds, as Valkey takes. Each must be a finite number above 0, except `waitMs` and `staleMs`, which may be 0: otherwise the constructor throws [`LeaseCacheDurationError`](#errors).

## `cache.get(key, load, options?)`

Returns the cached value, or calls `load` and caches what it returns.

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Identifies the value, without the prefix. |
| `load` | `() => Promise<T>` | Loads the value from the source of truth. `T` must extend [`Json`](#json). |
| `options.ttlMs` | `number \| ((value: T) => number)` | How long this value is cached, in place of the cache's `ttlMs`. A function gets the loaded value. Above 0. |

```ts
import type { LeaseCache } from 'lease-cache';

type User = { readonly id: number; readonly name: string };
declare const db: { users: { find: (id: number) => Promise<User | null> } };
declare const cache: LeaseCache;
declare const id: number;
// ---cut---
// Cache a missing row for less time than a found one
const user = await cache.get(`user:${id}`, async () => db.users.find(id), {
    ttlMs: found => (found ? 60_000 : 5000),
});
```

**Returns** `Promise<T>`:

- The cached value, when there is one.
- What `load` returned, when this reader took the lease. It is cached if the lease still holds this reader's token, which an `invalidate()` during the load prevents.
- The value another reader cached, when that reader held the lease. This reader checks every `pollMs`.
- The stale value, when another reader holds the lease and `staleMs` kept one.
- What `load` returned, uncached, once `waitMs` passes without a value.

**Rejects** with what `load` threw. The lease is freed first, so a waiting reader takes it right away. Also rejects, freeing the lease and caching nothing, with [`LeaseCacheDurationError`](#errors) when a computed `ttlMs` isn't above 0, and [`LeaseCacheValueError`](#errors) when `load` returns something JSON can't store, such as `undefined`.

## `cache.read(key, load, options?)`

As [`get`](#cache-get-key-load-options), but also says where the value came from, and how much longer Valkey caches it. For a cache in front of this one (a memory tier), which must not keep a value longer than this one does, or keep one this one didn't cache: a value that isn't cached may already be outdated.

**Returns** `Promise<ReadResult<T>>`: `{ value, source, ttlMs }`.

| `source` | The value | `ttlMs` |
|---|---|---|
| `'hit'` | Was cached already. | The time it has left. |
| `'filled'` | Was loaded with the lease, and cached. | The value's `ttlMs`. |
| `'lost'` | Was loaded, but the lease was lost first (invalidated, or run out), so it wasn't cached. | `0` |
| `'stale'` | Was kept by an invalidation (`staleMs`), and returned rather than waiting. | `0` |
| `'timeout'` | Was loaded without a lease, after waiting `waitMs`. | `0` |
| `'unavailable'` | Was loaded without the cache, as Valkey failed. Only with `onUnavailable`: without it, the read rejects with Valkey's error. | `0` |

```ts
import type { LeaseCache } from 'lease-cache';

declare const cache: LeaseCache;
declare const memory: Map<string, { readonly value: string; readonly expiresAt: number }>;
// ---cut---
const { value, ttlMs } = await cache.read('greeting', async () => 'hello');
// Kept in memory no longer than in Valkey, and not at all when it isn't cached there
if (ttlMs > 0) {
    memory.set('greeting', { value, expiresAt: Date.now() + ttlMs });
}
```

## `cache.invalidate(key)`

Deletes the value and its lease, so the next read loads it. A load already in progress returns to its caller, but caches nothing. Call it after the source of truth changes. With `staleMs`, the old value is first kept as stale.

Rejects when Valkey fails, even with `onUnavailable`: an invalidation that didn't happen leaves the old value cached once Valkey is back.

**Returns** `Promise<void>`.

## Errors

Every error `lease-cache` throws extends `LeaseCacheError`. What `load` throws is passed on as it is.

| Error | When |
|-------|------|
| `LeaseCacheDurationError` | A duration isn't a finite number above 0 (`waitMs` and `staleMs` may be 0). Has `option` and `value`. |
| `LeaseCacheValueError` | `load` returned something JSON can't store, e.g. `undefined`. Has `key`. |

## `Json`

The values a loader may return: `boolean`, `number`, `string`, `null`, and arrays and plain objects of them. Values are stored as JSON, so only these survive the round trip.

Use type aliases, rather than interfaces, for loaded values: TypeScript doesn't treat an interface as having an index signature, so it doesn't extend `Json`.

## `LeaseCacheConnection`

The one command the cache needs: `eval(script: string, numKeys: number, ...args: (number | string)[]): Promise<unknown>`. An ioredis or iovalkey `Redis` or `Cluster` fits as it is, and [Clients](/lease-cache/guides/clients) has adapters for node-redis and Valkey GLIDE:

```ts
import { Cluster, Redis } from 'ioredis';
import type { LeaseCacheConnection } from 'lease-cache';

const single: LeaseCacheConnection = new Redis('redis://valkey:6379');
const cluster: LeaseCacheConnection = new Cluster([{ host: 'valkey', port: 6379 }]);
```

The keys of each value share a hash tag (`<prefix>:{<key>}:...`), so on a cluster they live on the same node, which the scripts need.
