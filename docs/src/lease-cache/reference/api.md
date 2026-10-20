---
description: LeaseCache, its options, get and invalidate, and the Json and LeaseCacheConnection types.
---

# API

## `new LeaseCache(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `connection` | [`LeaseCacheConnection`](#leasecacheconnection) | — | Runs the cache's scripts. See [Clients](/lease-cache/guides/clients). Never closed by the cache. |
| `prefix` | `string` | — | Prefix of every key, so several caches can share a server. |
| `ttlMs` | `number` | — | How long a loaded value is cached, in milliseconds. |
| `leaseMs` | `number` | — | How long a reader may load before another can take over. Longer than a load usually takes: a load that outlives its lease still returns, but caches nothing. |
| `pollMs` | `number` | — | How often a reader waiting on another's load checks again. |
| `waitMs` | `number` | — | How long a reader waits on another's load before loading itself. It then caches nothing, as it holds no lease. Bounds how long a stuck load can stall everyone else. |
| `staleMs` | `number` | `0` (off) | After `invalidate()`, how long the old value is kept as stale. A reader that would wait on another's load returns it instead. See [Serving stale values](/lease-cache/guides/invalidation#serving-stale-values-while-the-next-load-runs). |
| `onWait` | `(key: string) => void` | — | Called each time a reader finds another reader loading the key, and waits. For example, to count the loads that leases saved. |

## `cache.get(key, load)`

Returns the cached value, or calls `load` and caches what it returns.

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Identifies the value, without the prefix. |
| `load` | `() => Promise<T>` | Loads the value from the source of truth. `T` must extend [`Json`](#json). |

**Returns** `Promise<T>`:

- The cached value, when there is one.
- What `load` returned, when this reader took the lease. It is cached if the lease still holds this reader's token, which an `invalidate()` during the load prevents.
- The value another reader cached, when that reader held the lease. This reader checks every `pollMs`.
- The stale value, when another reader holds the lease and `staleMs` kept one.
- What `load` returned, uncached, once `waitMs` passes without a value.

**Rejects** with what `load` threw. The lease is freed first, so a waiting reader takes it right away.

## `cache.invalidate(key)`

Deletes the value and its lease, so the next read loads it. A load already in progress returns to its caller, but caches nothing. Call it after the source of truth changes. With `staleMs`, the old value is first kept as stale.

**Returns** `Promise<void>`.

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
