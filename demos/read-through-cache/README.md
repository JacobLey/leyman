# demo-read-through-cache

A read-through cache on Valkey built from BentoCache and lease-cache, with a memory tier, stale-while-revalidate, one load per key across instances, and sharding with weighted rendezvous hashing.

This demo puts [BentoCache](https://bentocache.dev) together with Valkey to build a read-through cache that's fit for production, using [lease-cache](../../tools/lease-cache) where BentoCache falls short. Every feature sits behind its own option, so its effect (and its cost) can be tested on its own.

It's a worked example rather than a package, and isn't published. The code itself is short, so most of this README explains why it's built this way, including what BentoCache doesn't do and what was learned while building it.

## Contents

- [Example](#example)
- [Options](#options)
- [Reading values](#reading-values)
  - [Resources: keys derived from inputs](#resources-keys-derived-from-inputs)
  - [TTL per value](#ttl-per-value)
- [How a read flows](#how-a-read-flows)
- [Features](#features)
  - [Read-through, one load per instance](#read-through-one-load-per-instance)
  - [Memory tier, and keeping it in sync](#memory-tier-and-keeping-it-in-sync)
  - [Stale-while-revalidate](#stale-while-revalidate)
  - [lease-cache: one load across instances, and no outdated values](#lease-cache-one-load-across-instances-and-no-outdated-values)
  - [When Valkey is down](#when-valkey-is-down)
  - [Sharding over several Valkey nodes](#sharding-over-several-valkey-nodes)
- [Composing with haywire](#composing-with-haywire)
- [Not covered](#not-covered)
- [Testing](#testing)

## Example

A cache on a Valkey connection the application already has (say, for rate limiting), with copies in memory kept in sync, stale values served while refreshing, and each miss loaded once across every instance:

```ts
import { createReadThroughCache } from '@leyman/demo-read-through-cache';
import { Redis } from 'ioredis';

const valkey = new Redis('redis://valkey:6379');

const { cache, close } = createReadThroughCache({
    connection: valkey,
    prefix: 'app',
    ttlMs: 60_000,
    memory: { maxItems: 10_000, sync: true },
    staleWhileRevalidate: { graceMs: 24 * 60 * 60_000 },
    leases: { leaseMs: 5000, pollMs: 50, waitMs: 2000 },
});

// Defined once: the key comes from the input, so it can't drift from what is loaded
const users = cache.resource({
    key: ({ id }: { id: number }) => `user:${id}`,
    load: async ({ id }) => db.users.find(id),
    // A missing user may be created soon: cache it for less time
    ttlMs: user => (user ? 60_000 : 5000),
});

const user = await users.get({ id });

await users.invalidate({ id }); // after an update: next read loads
await users.expire({ id }); // or: next read serves the old value while loading

await close(); // closes what the cache opened. `valkey` stays open.
```

Values are stored as JSON, so loaders must return JSON-compatible types (`Json`), and a `Date` would come back as a string. Use type aliases rather than interfaces for loaded values, since TypeScript doesn't treat interfaces as having an index signature.

## Options

`createReadThroughCache(options)` returns `{ cache, close }`. Each feature is off unless its option is given:

| Option                 | Description                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection`           | Required. A Valkey connection the application already has (an ioredis `Redis`). Values are stored on it unless `shards` are given, and memory tiers sync through it. Never closed by the cache.                                                                                                                                                                       |
| `prefix`               | Required. Prefix of every key, so several caches can share nodes.                                                                                                                                                                                                                                                                                                     |
| `ttlMs`                | Required. How long a loaded value is fresh, unless a read gives its own.                                                                                                                                                                                                                                                                                              |
| `memory`               | `{ maxItems, sync? }`: keep copies in each instance's memory, and with `sync`, drop them when any instance changes the key. See [Memory tier](#memory-tier-and-keeping-it-in-sync).                                                                                                                                                                                   |
| `staleWhileRevalidate` | `{ graceMs }`: once a value expires, serve it while a fresh one loads. See [Stale-while-revalidate](#stale-while-revalidate).                                                                                                                                                                                                                                         |
| `leases`               | `{ leaseMs, pollMs, waitMs, staleMs?, fallback? }`: load each miss once across every instance, and never cache a load that finishes after an invalidation, with lease-cache. `fallback` keeps reads working while Valkey is down (see [When Valkey is down](#when-valkey-is-down)). See [lease-cache](#lease-cache-one-load-across-instances-and-no-outdated-values). |
| `shards`               | `{ name, size, connection }[]`: spread keys over these nodes instead of `connection`. See [Sharding](#sharding-over-several-valkey-nodes).                                                                                                                                                                                                                            |
| `invalidateEveryNode`  | With `shards`, invalidate each key on every node, so changing the nodes is safe. See [Changing the nodes safely](#changing-the-nodes-safely).                                                                                                                                                                                                                         |
| `onLoadError`          | Called when a load fails, including background refreshes, whose errors no caller sees.                                                                                                                                                                                                                                                                                |
| `emitter`              | Receives BentoCache's events (`cache:hit`, `cache:miss`, `cache:written`...), e.g. for metrics.                                                                                                                                                                                                                                                                       |

Each option picks one of the [haywire](../../tools/haywire) bindings the cache is built from. To swap in your own binding, or to resize the nodes while running, compose the bindings directly (see [Composing with haywire](#composing-with-haywire)).

## Reading values

### Resources: keys derived from inputs

`cache.resource({ key, load, ttlMs? })` defines a kind of value once, with how its key is derived from an input and how the value is loaded. Reads, `expire` and `invalidate` then take the input instead of a key. It's the same idea as [normalized-react-query](../../tools/normalized-react-query)'s resources, for the same reason. When every call site builds a key and passes a loader, nothing stops one of them from pairing a key with the wrong loader (or making a typo in the key), and the cache then serves one thing under another's key.

Every input that loads a different value must give a different key, and two resources in one cache must not produce the same key, so include the kind of value in it (`user:${id}`, `team:${id}`).

`cache.get(key, load, options?)` is still there, for one-off reads, and is what resources call.

### TTL per value

`ttlMs` on a resource (or in `get`'s options) replaces the cache's `ttlMs`. It's either a number, or a function of the loaded value (and, for a resource, the input). That lets you cache a missing row for less time than a found one, say, or set the TTL by how often a kind of row changes.

It's applied after the load, through BentoCache's `ctx.setOptions({ ttl })`, so every tier BentoCache writes keeps the value that long. With leases, lease-cache computes the TTL for the value it stores, and the memory tier keeps each value only as long as lease-cache has left on it (a value read from lease-cache an hour into its TTL doesn't get a fresh TTL in memory). A load that fails isn't cached. To cache a failure for a short while, return it as a value (`{ error: 'not-found' }`) and give it a short TTL.

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
       └─ lease-cache:            hit ─▶ return (BentoCache copies into memory, for the TTL left)
                                  miss, lease free ─▶ take it, load, cache if the lease is still ours
                                  miss, lease taken ─▶ poll until the value appears
```

## Features

### Read-through, one load per instance

BentoCache's `getOrSet` covers the whole read-through pattern. It looks in each tier, calls the factory on a miss, and writes the result back. It also takes a per-key lock within the process, so 100 concurrent requests for a missing key in one instance call the loader once. This is always on.

`null` is cached like any other value, which is what you want when a row doesn't exist, because otherwise every request for the missing row would reach the database. `undefined` can't be cached.

When the loader throws, nothing is cached, and the caller gets BentoCache's `errors.E_FACTORY_ERROR`, with what the loader threw as its `cause`.

### Memory tier, and keeping it in sync

`memory: { maxItems }` (`memoryTierBinding`) adds an LRU in each instance, in front of Valkey. Reads that hit it don't leave the process.

The downside is that when a key changes, other instances keep their copy until it expires. `memory: { maxItems, sync: true }` (`syncedMemoryTierBinding`) fixes that with BentoCache's bus. Every write, expire or delete is published over Valkey pub/sub, and every other instance drops its copy.

A few things came up while building this:

- The bus channel is named after the store, so caches with different prefixes but the same store name share a channel. They don't interfere, since each message is tagged with its prefix and caches with another prefix ignore it, but every instance still receives every cache's messages. Naming the store after the prefix gives each cache its own channel.
- The bus subscribes in the background, so an instance can miss messages published in its first moments. The tests wait for the subscription (`PUBSUB NUMSUB`) rather than assume it's there.
- The bus opens two connections (publisher and subscriber), duplicated from the application's connection. It closes them when the cache's container is disposed, and leaves the application's connection open.

### Stale-while-revalidate

`staleWhileRevalidate: { graceMs }` (`staleWhileRevalidateBinding`) keeps entries for `graceMs` after they were loaded, even once their `ttlMs` has passed. A read of an expired entry returns it immediately, and refreshes it in the background. If the refresh fails, the stale value keeps being served, and `onLoadError` is the only place the failure shows up, since no caller is waiting on it.

- `graceMs` counts from when the value was loaded rather than from when it expired, because BentoCache sets the entry's physical TTL to `graceMs`. So it has to be longer than `ttlMs` to do anything.
- With lease-cache as the shared tier, stale values only live in memory (see [lease-cache](#lease-cache-one-load-across-instances-and-no-outdated-values)), so this also needs a memory tier.
- BentoCache's `timeout` option controls how long a read waits for the fresh value before falling back to the stale one. It's fixed at `0` here, so a read returns the stale value right away.
- `expire(key)` marks a value stale without deleting it, so the next read still gets an answer instantly. `invalidate(key)` deletes it. With `waitForFreshBinding`, the two do the same thing.

### lease-cache: one load across instances, and no outdated values

BentoCache's own Valkey tier leaves two gaps, which [lease-cache](../../tools/lease-cache) fills.

The first is that every instance loads a shared miss. BentoCache's lock only works within one process, so when a popular key expires, every instance misses it at once and each one calls the loader.

The second is that a load that finishes after an invalidation caches what it read. Say a read misses and starts loading the row. Meanwhile, the row is updated and the key invalidated. The read then caches the old row until it expires. A test shows this happening with BentoCache's own tier, and not with lease-cache.

`leases: { leaseMs, pollMs, waitMs }` (`leaseCacheTierBinding`) makes lease-cache the shared tier, in place of BentoCache's. The first reader to miss takes a lease in Valkey and loads the value, and the others wait for it. The value is only cached if the lease still holds the reader's token, and `invalidate` deletes the value and the lease together, so a load that started before the invalidation can't cache its result. [WHY-LEASE-CACHE.md](../../tools/lease-cache/WHY-LEASE-CACHE.md) explains why that is enough, and what it relies on.

BentoCache then only does what lease-cache doesn't, which is the memory tier, its sync, and grace periods. That has a few consequences:

- Stale values on expiry only live in memory. lease-cache doesn't keep a stale copy of a value that runs out, so stale-while-revalidate needs a memory tier. A refresh still loads once across instances, because the other instances' background refreshes wait on the lease and pick up its value.
- After `expire()` or `invalidate()`, lease-cache can keep the old value, with `leases: { ..., staleMs }`. Instances that would wait on the next load return the old value instead, with or without a memory tier.
- BentoCache gets no Valkey layer at all, so it can't cache an outdated value behind lease-cache's back.
- The memory tier only keeps what lease-cache cached. lease-cache's `read()` says whether it cached each value, and for how long. lease-cache doesn't cache a load that lost its lease to an invalidation, a stale value, or a load after `waitMs`, so the factory skips BentoCache's cache for them too (`ctx.skip()`), and the value is returned without any tier keeping it. Otherwise the memory tier would keep exactly the outdated load that lease-cache refused, for the whole TTL. Tests show both cases, with a memory tier.

Two things were learned along the way:

- Don't wrap the loader in a lock and let BentoCache do the write. The first version of this demo did that, with its own lease around the loader. BentoCache writes the value _after_ the factory returns, so the lease could never be released on success (a waiting instance would take it, find nothing, and load again). The write also can't be made conditional on still holding the lease, so the invalidation race stayed open. Making lease-cache the tier puts the check and the write in one step.
- BentoCache doesn't give background refreshes a `gracedEntry`, so a factory can't tell a refresh (whose caller already has a stale value) from a reader with nothing to return. This was reported upstream as [Julien-R44/bentocache#124](https://github.com/Julien-R44/bentocache/pull/124).

### When Valkey is down

What happens depends on the shared tier, and on whether there is a memory tier.

|                                           | Valkey down                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| BentoCache's own tier, no memory tier     | Every read fails (`E_L2_CACHE_ERROR`).                                                                              |
| BentoCache's own tier, with a memory tier | Reads skip Valkey, since BentoCache ignores its errors when it has a memory tier, and keeps what it loads there.    |
| lease-cache                               | Every read fails (`E_FACTORY_ERROR`, with Valkey's error as its cause).                                             |
| lease-cache, with `fallback`              | Reads keep working, from an LRU in each instance's memory ([`lru-cache`](https://www.npmjs.com/package/lru-cache)). |

`leases: { ..., fallback: { maxItems, ttlMs, onUnavailable? } }` keeps a loaded value in an LRU for `ttlMs` when Valkey fails, and reads from it until Valkey is back. It's separate from the memory tier, which only keeps what lease-cache cached. While Valkey is down, the cache behaves differently:

- Each instance loads on its own. There are no leases without Valkey, so a miss is loaded once per instance rather than once overall.
- Invalidations don't reach other instances. `invalidate()` drops the key from this instance's LRU, then rejects, as lease-cache can't delete it. Every other instance serves its copy until `ttlMs` passes, which is why `ttlMs` should be short.
- A value loaded just before Valkey failed is kept, rather than loaded again.

Without `fallback`, the cache is exactly as available as Valkey, which is the right choice when serving data a few seconds old is worse than failing. lease-cache's own [`onUnavailable`](../../tools/lease-cache#when-valkey-is-down) sits in between, where reads keep working but nothing is cached.

### Sharding over several Valkey nodes

BentoCache's Redis driver talks to one server, or to a Redis Cluster (Valkey cluster mode), which places keys by hash slot and needs every node configured as a cluster. [`ShardedValkeyDriver`](./src/lib/sharded-valkey-driver.ts) spreads keys over independent servers instead, as a custom BentoCache L2 driver. It picks each key's server with [`weighted-rendezvous-hash`](../../tools/constant-consistent-hash/weighted-rendezvous-hash), then delegates to BentoCache's own Redis driver for that server, so values are stored exactly as BentoCache would store them. A single node is just a topology of one, through the same driver.

For a fixed set of nodes, pass the application's connections as `shards`:

```ts
const { cache, close } = createReadThroughCache({
    connection: valkey,
    shards: [
        { name: 'cache-a', size: 1, connection: cacheA },
        { name: 'cache-b', size: 2, connection: cacheB },
    ],
    prefix: 'app',
    ttlMs: 60_000,
});
```

Options (and a container's bindings) are fixed once the cache is built, so nodes that change while the application runs can't come from them. Instead, the application creates a `ResizableValkeyTopology` itself (it opens a connection per node, and closes them when disposed), [binds](#composing-with-haywire) the instance, and resizes it later:

```ts
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

- Any node can be added, removed or resized, and only the keys that have to move do (into an added node, or out of a removed one). `resize()` keeps the connections of unchanged nodes, and closes those of removed ones. The tests check that after adding a third node to two, exactly the keys whose node changed are loaded again.
- Sizes are meant to follow memory, so a node of size 2 gets twice the keys of a node of size 1. Size 0 drains a node while keeping it connected.
- Every client computes the same placement from the node list alone. There is no ring to build or share, but every instance must be given the same list.
- With lease-cache, each node gets its own lease cache, and a key's lease lives next to its value.
- Moved keys are left behind. They aren't deleted from their old node, but they're not read there any more.

#### Changing the nodes safely

Instances don't change their node lists at the same moment. While a change rolls out, two instances can place a key on different nodes, and an invalidation from one only reaches the node it knows about, so the other node keeps serving its copy until it expires. A node that is removed and added back can also serve values from before it left. Two habits prevent both problems:

1. Nodes join and leave at size `0`. Add a node at size `0` (connected, but holding no keys) and roll that out to every instance before giving it a size. To remove a node, drain it to `0`, wait for the longest TTL, then remove it. Each instance then knows every node that might hold a key, and nothing outlives the drain.
2. Invalidate on every node, with `invalidateEveryNode` (an option of `createReadThroughCache` with `shards`, and of `rendezvousTopology` and `ResizableValkeyTopology`). Each invalidation and `expire()` then goes to every node, at one round trip per node, and reaches every copy.

The tests show both. By default, an invalidation from an instance with the old list misses the copy on the new node, and with `invalidateEveryNode` it reaches it.

With `invalidateEveryNode`, `ResizableValkeyTopology.resize()` refuses a step that skips size `0`, such as a node that joins with a size (or moves to another URL), or one removed before it's drained. How long to wait between steps is up to you. No instance can tell when every other instance has the change, or which of two node lists is newer, so a check across instances (comparing fingerprints of each one's node list) could report that a rollout is in progress, but couldn't make it safe.

For nodes that only grow and shrink at the end of a list, [`constant-consistent-hash`](../../tools/constant-consistent-hash/ts) places keys in constant time instead.

## Composing with haywire

`createReadThroughCache` is a shortcut. The cache is made of [haywire](../../tools/haywire) bindings, and each option picks one of them. `readThroughCacheModule` holds the cache itself, and needs one binding for each setting the application provides, and one for each feature. Compose them directly to bind something the options can't express (a `ResizableValkeyTopology`, or your own memory tier), or to share bindings with the rest of an application built with haywire:

```ts
const container = createContainer(
    readThroughCacheModule
        .addBinding(bind(cacheConfigId).withInstance({ prefix: 'app', ttlMs: 60_000 }))
        .addBinding(bind(valkeyConnectionId).withInstance(valkey))
        .addBinding(singleNodeTopologyBinding)
        .addBinding(syncedMemoryTierBinding({ maxItems: 10_000 }))
        .addBinding(staleWhileRevalidateBinding({ graceMs: 24 * 60 * 60_000 }))
        .addBinding(leaseCacheTierBinding({ leaseMs: 5000, pollMs: 50, waitMs: 2000 }))
);
const cache = container.get(ReadThroughCache);

await container[Symbol.asyncDispose]();
```

| Id                       | Bound by        | Choices                                                                                                                                             |
| ------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cacheConfigId`          | the application | `{ prefix, ttlMs, onLoadError?, emitter? }`                                                                                                         |
| `valkeyConnectionId`     | the application | Its own connection. Needed by `singleNodeTopologyBinding` and `syncedMemoryTierBinding`                                                             |
| `valkeyShardId` (a list) | the application | `{ name, size, connection }`, one binding per node. Needed by `shardedTopologyBinding`                                                              |
| `valkeyTopologyId`       | a feature       | `singleNodeTopologyBinding` · `shardedTopologyBinding` · a `ResizableValkeyTopology` instance (see [Sharding](#sharding-over-several-valkey-nodes)) |
| `sharedTierId`           | a feature       | `bentoValkeyTierBinding` (BentoCache's own Valkey tier) · `leaseCacheTierBinding({ leaseMs, pollMs, waitMs, staleMs?, fallback? })`                 |
| `memoryTierId`           | a feature       | `noMemoryTierBinding` · `memoryTierBinding({ maxItems })` · `syncedMemoryTierBinding({ maxItems })`                                                 |
| `expiryPolicyId`         | a feature       | `waitForFreshBinding` · `staleWhileRevalidateBinding({ graceMs })`                                                                                  |

A missing or doubled choice is a type error, and every combination works. Each feature is one small binding, so the code for, say, the memory tier is all in [`src/lib/memory-tier.ts`](./src/lib/memory-tier.ts).

`createReadThroughCache` itself ([`src/lib/create.ts`](./src/lib/create.ts)) starts with every feature off, and swaps in a binding for each option with `replaceBinding()`. A replacement keeps the module's type, so haywire still checks that the result is complete. (Adding a different binding in each branch of an `if` wouldn't, because each combination would be its own module type.)

Who closes what follows from how each value was bound. Every Valkey connection belongs to the application and is bound with `withInstance()`, and a container doesn't close those, so the cache can share a connection with anything else (a rate limiter, another cache). Disposing the container (or calling `close()`) only closes what BentoCache opened itself, which is the bus's pub/sub connections. The Valkey driver doesn't close connections.

## Not covered

- Loads from a lagging replica. lease-cache's guarantee assumes that a load starting after an invalidation reads the change, so a load that reads from a replica behind the primary can still cache the old row.
- Batch loads. BentoCache's `getOrSet` doesn't support reading many keys with one query for the missing ones (DataLoader-style).
- Caching failures. A load that throws isn't cached, so to cache a failure, return it as a value with a short [TTL](#ttl-per-value).
- Values from an older deploy. The cache trusts that what it reads has the current shape, so put a version in `prefix` when the shape of a value changes.

## Testing

The tests run against a real Valkey, which is a `valkey` sidecar in the devcontainer and a service bound under the same hostname in Dagger. No part of the demo is mocked.

- Several logical databases stand in for several servers. Nodes in the tests are databases `1` to `4` of one server, which don't share keys, and that's all sharding needs.
- Each test varies one feature. It starts from a baseline module (one node, BentoCache's own Valkey tier, no memory tier, no grace), and swaps in the feature it's about with `replaceBinding()`, which haywire type-checks like any other binding. `createReadThroughCache` has its own tests for each option.
- Each container stands in for a process. Two containers in one test share no BentoCache, memory tier or locks, only Valkey, like two pods would. (They do share the application's connection, as a stand-in for Valkey itself.)
- The tests order events rather than waiting on time. The test controls the loader (`test/helpers/loader.ts`), and each call stays pending until the test resolves it. Background work is awaited through events, using lease-cache's `onWait` when an instance waits on another's lease, and BentoCache's `cache:written` when a refresh is written. TTLs and leases are long enough that they don't run out during a test, and expiry is triggered with `expire()` instead.
- Every test uses its own prefix, so tests don't need to clear the server, and don't see each other's keys.
