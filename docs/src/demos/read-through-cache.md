---
description: Read-through caching on Valkey with BentoCache and lease-cache, composed from haywire bindings, with a memory tier, stale-while-revalidate, one load per key across instances, and sharding.
---

# Read-through cache

**Source:** [`demos/read-through-cache`](https://github.com/JacobLey/leyman/tree/main/demos/read-through-cache)

Read-through caching on Valkey with BentoCache: memory tier, stale-while-revalidate, one load per key across instances with lease-cache, and sharding with weighted rendezvous hashing.

A worked example, not a package: it is never published. It shows how to put [BentoCache](https://bentocache.dev) together with Valkey (and [lease-cache](/lease-cache/), where BentoCache falls short) for a production-shaped cache, with every feature behind an option so its effect (and cost) can be tested on its own. The code is short; this page explains why it is shaped the way it is, including what BentoCache does not do and what was learned building it.

## Example

A cache on a Valkey connection the application already has (say, for rate limiting), with copies in memory kept in sync, stale values served while refreshing, and each miss loaded once across every instance:

```ts
type User = { readonly id: number; readonly name: string };
declare const db: { users: { find: (id: number) => Promise<User | null> } };
declare const id: number;
// ---cut---
import {
    cacheConfigId,
    leaseCacheTierBinding,
    ReadThroughCache,
    readThroughCacheModule,
    singleNodeTopologyBinding,
    staleWhileRevalidateBinding,
    syncedMemoryTierBinding,
    valkeyConnectionId,
} from '@leyman/demo-read-through-cache';
import { bind, createContainer } from 'haywire';
import { Redis } from 'ioredis';

const valkey = new Redis('redis://valkey:6379');

const container = createContainer(
    readThroughCacheModule
        .addBinding(bind(cacheConfigId).withInstance({ prefix: 'users', ttlMs: 60_000 }))
        .addBinding(bind(valkeyConnectionId).withInstance(valkey))
        .addBinding(singleNodeTopologyBinding)
        .addBinding(syncedMemoryTierBinding({ maxItems: 10_000 }))
        .addBinding(staleWhileRevalidateBinding({ graceMs: 24 * 60 * 60_000 }))
        .addBinding(leaseCacheTierBinding({ leaseMs: 5000, pollMs: 50, waitMs: 2000 }))
);
const cache = container.get(ReadThroughCache);

const user = await cache.get(`user:${id}`, async () => db.users.find(id));

await cache.invalidate(`user:${id}`); // after an update: next read loads
await cache.expire(`user:${id}`); // or: next read serves the old value while loading

await container.disposeAsync(); // closes what the cache opened. `valkey` stays open.
```

Values are stored as JSON, so `get` only accepts loaders returning JSON-compatible types (`Json`): a `Date` would come back as a string. Use type aliases rather than interfaces for loaded values, since TypeScript doesn't treat interfaces as having an index signature.

## Composing a cache

A cache is [haywire](/haywire/) bindings: `readThroughCacheModule` holds the cache itself, and needs one binding for each setting the application provides, and one for each feature:

| Id | Bound by | Choices |
|---|---|---|
| `cacheConfigId` | the application | `{ prefix, ttlMs, onLoadError?, emitter? }` |
| `valkeyConnectionId` | the application | Its own connection. Needed by `singleNodeTopologyBinding` and `syncedMemoryTierBinding` |
| `valkeyShardId` (a list) | the application | `{ name, size, connection }`, one binding per node. Needed by `shardedTopologyBinding` |
| `valkeyTopologyId` | a feature | `singleNodeTopologyBinding` · `shardedTopologyBinding` · a `ResizableValkeyTopology` instance (see [Sharding](#sharding-over-several-valkey-nodes)) |
| `sharedTierId` | a feature | `bentoValkeyTierBinding` (BentoCache's own Valkey tier) · `leaseCacheTierBinding({ leaseMs, pollMs, waitMs })` |
| `memoryTierId` | a feature | `noMemoryTierBinding` · `memoryTierBinding({ maxItems })` · `syncedMemoryTierBinding({ maxItems })` |
| `expiryPolicyId` | a feature | `waitForFreshBinding` · `staleWhileRevalidateBinding({ graceMs })` |

A missing or doubled choice is a type error, and every combination works. Each feature is one small binding, so the code for, say, the memory tier is all in [`src/lib/memory-tier.ts`](https://github.com/JacobLey/leyman/tree/main/demos/read-through-cache/src/lib/memory-tier.ts).

**Who closes what** follows from how each value was bound. Every Valkey connection is the application's, bound with `withInstance()`, which a container never closes: the cache can share a connection with anything else (a rate limiter, another cache). Disposing the container closes only what BentoCache opened itself: the bus's pub/sub connections. The Valkey driver never closes connections.

## How a read flows

```
get(key, load)
  │
  ├─ memory tier (this instance)          ─ hit ─▶ return
  │                                         stale + grace ─▶ return stale, refresh in background ─┐
  ├─ BentoCache's per-key lock (this instance): concurrent reads of the key wait for one load      │
  │                                                                                                │
  └─ shared tier, on the Valkey node for the key (chosen by weighted rendezvous hash) ◀───────────┘
       │
       ├─ BentoCache's own tier:  hit ─▶ copy into memory, return
       │                          miss ─▶ load ─▶ BentoCache writes Valkey + memory, publishes
       │
       └─ lease-cache:            hit ─▶ return (BentoCache copies into memory)
                                  miss, lease free ─▶ take it, load, cache if the lease is still ours
                                  miss, lease taken ─▶ poll until the value appears
```

## Features

### Read-through, one load per instance

BentoCache's `getOrSet` is the whole read-through pattern: look in each tier, call the factory on a miss, write the result back. It also takes a per-key lock within the process, so 100 concurrent requests for a missing key in one instance call the loader once. This is always on.

`null` is cached like any other value, which is what you want for "this row doesn't exist" lookups: without it, every request for a missing row reaches the database. `undefined` can't be cached.

When the loader throws, nothing is cached, and the caller gets BentoCache's `errors.E_FACTORY_ERROR`, with what the loader threw as its `cause`.

### Memory tier, and keeping it in sync

`memoryTierBinding({ maxItems })` adds an LRU in each instance, in front of Valkey. Reads that hit it never leave the process.

The cost: when a key changes, other instances keep their copy until it expires. `syncedMemoryTierBinding({ maxItems })` fixes that with BentoCache's bus: every write, expire or delete is published over Valkey pub/sub, and every other instance drops its copy.

Learned along the way:

- **The bus channel is named after the store**, so caches with different prefixes but the same store name share a channel. They don't interfere, since each message is tagged with its prefix and ignored by caches with another, but every instance still receives every cache's messages. Naming the store after the prefix gives each cache its own channel.
- **The bus subscribes in the background.** An instance can miss messages published in its first moments. The tests wait for the subscription (`PUBSUB NUMSUB`) rather than assume it.
- The bus opens two connections (publisher and subscriber), duplicated from the application's connection. It closes them when the cache's container is disposed, and leaves the application's connection open.

### Stale-while-revalidate

`staleWhileRevalidateBinding({ graceMs })` keeps entries for `graceMs` after they were loaded, even once their `ttlMs` has passed. A read of an expired entry returns it immediately, and refreshes it in the background. If the refresh fails, the stale value keeps being served, and `onLoadError` is the only place the failure shows up (no caller is waiting on it).

- **`graceMs` counts from when the value was loaded**, not from when it expired: BentoCache sets the entry's physical TTL to `graceMs`. So it must be longer than `ttlMs` to do anything.
- **With lease-cache as the shared tier, stale values only live in memory** (see [lease-cache](#lease-cache-one-load-across-instances-and-no-outdated-values)), so this also needs a memory tier.
- BentoCache's `timeout` option controls how long a read waits for the fresh value before falling back to the stale one. It is fixed at `0` here: return stale right away.
- `expire(key)` marks a value stale without deleting it, so the next read still gets an answer instantly. `invalidate(key)` deletes it. With `waitForFreshBinding`, the two are the same.

### lease-cache: one load across instances, and no outdated values

BentoCache's own Valkey tier leaves two gaps, which [lease-cache](/lease-cache/) closes:

- **Every instance loads a shared miss.** BentoCache's lock only works within one process. When a popular key expires, every instance misses it at once, and each calls the loader.
- **A load that finishes after an invalidation caches what it read.** A read misses and starts loading the old row. Meanwhile, the row is updated and the key invalidated. The read then caches the old row, until it expires. A test shows this happening with BentoCache's own tier, and not with lease-cache.

`leaseCacheTierBinding({ leaseMs, pollMs, waitMs })` makes lease-cache the shared tier, in place of BentoCache's. The first reader to miss takes a lease in Valkey and loads. Others wait for its value. The value is cached only if the lease still holds the reader's token, and `invalidate` deletes value and lease together, so a load from before the invalidation can't cache. [Why lease-cache](/lease-cache/why) has the argument for why that is enough, and what it relies on.

BentoCache then keeps only what lease-cache doesn't do: the memory tier, its sync, and grace periods. So:

- **Stale values on expiry only live in memory.** lease-cache keeps no stale copy of a value that runs out, so stale-while-revalidate needs a memory tier. A refresh then still loads once across instances: the others' background refreshes wait on the lease, and pick up its value.
- **After `expire()` or `invalidate()`, lease-cache can keep the old value**: `leaseCacheTierBinding({ ..., staleMs })`. Instances that would wait on the next load return it instead, with or without a memory tier.
- **BentoCache gets no Valkey layer at all**, so it can't cache an outdated value behind lease-cache's back.

Learned along the way:

- **Don't wrap the loader with a lock and let BentoCache write.** The first version of this demo did, with its own lease around the loader. BentoCache writes the value *after* the factory returns, so the lease could never be released on success (a waiting instance would take it, find nothing, and load again), and the write can't be made conditional on still holding the lease, so the invalidation race stayed open. Making lease-cache the tier puts the check and the write in one step.
- **BentoCache gives background refreshes no `gracedEntry`**, so a factory can't tell a refresh (whose caller already has a stale value) from a reader with nothing to return. Reported upstream as [Julien-R44/bentocache#124](https://github.com/Julien-R44/bentocache/pull/124).

### Sharding over several Valkey nodes

BentoCache's Redis driver talks to one server, or to a Redis Cluster (Valkey cluster mode), which places keys by hash slot and needs every node configured as a cluster. [`ShardedValkeyDriver`](https://github.com/JacobLey/leyman/tree/main/demos/read-through-cache/src/lib/sharded-valkey-driver.ts) spreads keys over independent servers instead, as a custom BentoCache L2 driver. It picks each key's server with [`weighted-rendezvous-hash`](https://github.com/JacobLey/leyman/tree/main/tools/constant-consistent-hash/weighted-rendezvous-hash), then delegates to BentoCache's own Redis driver for that server, so values are stored exactly as BentoCache would store them. A single node is just a topology of one, through the same driver.

For a fixed set of nodes, bind each of the application's connections as an element of the `valkeyShardId` list, with `shardedTopologyBinding`:

```ts
import type { Redis } from 'ioredis';
import { bind } from 'haywire';
import {
    readThroughCacheModule,
    shardedTopologyBinding,
    valkeyShardId,
} from '@leyman/demo-read-through-cache';

declare const cacheA: Redis;
declare const cacheB: Redis;
// ---cut---
readThroughCacheModule
    // ...settings and other features
    .addBinding(shardedTopologyBinding)
    .addBinding(bind(valkeyShardId).withInstance({ name: 'cache-a', size: 1, connection: cacheA }))
    .addBinding(bind(valkeyShardId).withInstance({ name: 'cache-b', size: 2, connection: cacheB }));
```

A container's bindings are fixed once it's built, so nodes that change while the application runs can't come from one. The application creates a `ResizableValkeyTopology` itself (it opens a connection per node, and closes them when disposed), binds the instance, and resizes it:

```ts
import { bind, createContainer } from 'haywire';
import {
    cacheConfigId,
    leaseCacheTierBinding,
    noMemoryTierBinding,
    readThroughCacheModule,
    ResizableValkeyTopology,
    valkeyTopologyId,
    waitForFreshBinding,
} from '@leyman/demo-read-through-cache';

const cacheModule = readThroughCacheModule
    .addBinding(bind(cacheConfigId).withInstance({ prefix: 'users', ttlMs: 60_000 }))
    .addBinding(noMemoryTierBinding)
    .addBinding(waitForFreshBinding)
    .addBinding(leaseCacheTierBinding({ leaseMs: 5000, pollMs: 50, waitMs: 2000 }));
// ---cut---
const nodes = [
    { name: 'cache-a', size: 1, url: 'redis://cache-a:6379' },
    { name: 'cache-b', size: 2, url: 'redis://cache-b:6379' },
];
await using topology = new ResizableValkeyTopology(nodes);
const container = createContainer(
    // `readThroughCacheModule`, with the settings and other features bound
    cacheModule.addBinding(bind(valkeyTopologyId).withInstance(topology))
);

// Later: only keys whose node changed are loaded again
await topology.resize([...nodes, { name: 'cache-c', size: 1, url: 'redis://cache-c:6379' }]);
```

- **Any node can be added, removed or resized**, and only keys that must move do (into an added node, out of a removed one). `resize()` keeps the connections of unchanged nodes, and closes those of removed ones. The tests check that after adding a third node to two, exactly the keys whose node changed are loaded again.
- **Size by memory**: a node of size 2 gets twice the keys of a node of size 1. Size 0 drains a node, keeping it connected.
- **Every client computes the same placement** from the node list alone. There is no ring to build or share, but every instance must be given the same list.
- With lease-cache, each node gets its own lease cache, and a key's lease lives next to its value.
- **Moved keys are left behind.** They aren't deleted from their old node, just never read there. If a node is removed and then added back before those keys expire, its old (possibly outdated) values are served again. Keep TTLs bounded, or clear a node before adding it back.

For nodes that only grow and shrink at the end of a list, [`constant-consistent-hash`](https://github.com/JacobLey/leyman/tree/main/tools/constant-consistent-hash/constant-consistent-hash) places keys in constant time instead.

## Not covered

- **Loads from a lagging replica.** lease-cache's guarantee assumes a load that starts after an invalidation reads the change. One that reads a replica behind the primary can still cache the old row.
- **Batch loads.** Reading many keys with one query for the missing ones (DataLoader-style) isn't supported by BentoCache's `getOrSet`.
- **Values from an older deploy.** The cache trusts that what it reads has the current shape. Put a version in `prefix` when the shape of a value changes.

## Testing

The tests run against a real Valkey: a `valkey` sidecar in the devcontainer, and a service bound under the same hostname in Dagger. Nothing in this demo is mocked.

- **Several databases stand in for several servers.** Nodes in the tests are logical databases `1` to `4` of one server: they never share keys, which is all sharding needs.
- **Tests vary one feature at a time.** Each starts from a baseline module (one node, BentoCache's own Valkey tier, no memory tier, no grace), and swaps in the feature it is about with `replaceBinding()`, which haywire type-checks like any other binding.
- **Each instance stands in for a process.** Two containers in one test share no BentoCache, memory tier or locks, only Valkey, like two pods. (They do share the application's connection, as a stand-in for Valkey itself.)
- **Tests order events, never wait on time.** The loader is controlled by the test ([`test/helpers/loader.ts`](https://github.com/JacobLey/leyman/tree/main/demos/read-through-cache/test/helpers/loader.ts)): each call stays pending until the test resolves it. Background work is awaited through events: lease-cache's `onWait` when an instance waits on another's lease, and BentoCache's `cache:written` when a refresh lands. TTLs and leases are long enough to never run out during a test, and expiry is triggered with `expire()` instead.
- **Every test uses its own prefix**, so tests never need to clear the server, and never see each other's keys.
