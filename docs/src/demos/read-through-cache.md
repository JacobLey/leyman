---
description: Read-through caching on Valkey with BentoCache and lease-cache, with a memory tier, stale-while-revalidate, one load per key across instances, resources keyed by input, per-value TTLs, and sharding.
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
//    ^?

await users.invalidate({ id }); // after an update: next read loads
await users.expire({ id }); // or: next read serves the old value while loading

await close(); // closes what the cache opened. `valkey` stays open.
```

Values are stored as JSON, so loaders must return JSON-compatible types (`Json`): a `Date` would come back as a string. Use type aliases rather than interfaces for loaded values, since TypeScript doesn't treat interfaces as having an index signature.

## Options

`createReadThroughCache(options)` returns `{ cache, close }`. Each feature is off unless its option is given:

| Option | Description |
|---|---|
| `connection` | Required. A Valkey connection the application already has (an ioredis `Redis`). Values are stored on it unless `shards` are given, and memory tiers sync through it. Never closed by the cache. |
| `prefix` | Required. Prefix of every key, so several caches can share nodes. |
| `ttlMs` | Required. How long a loaded value is fresh, unless a read gives its own. |
| `memory` | `{ maxItems, sync? }`: keep copies in each instance's memory, and with `sync`, drop them when any instance changes the key. See [Memory tier](#memory-tier-and-keeping-it-in-sync). |
| `staleWhileRevalidate` | `{ graceMs }`: once a value expires, serve it while a fresh one loads. See [Stale-while-revalidate](#stale-while-revalidate). |
| `leases` | `{ leaseMs, pollMs, waitMs, staleMs?, fallback? }`: load each miss once across every instance, and never cache a load that finishes after an invalidation, with lease-cache. `fallback` keeps reads working while Valkey is down (see [When Valkey is down](#when-valkey-is-down)). See [lease-cache](#lease-cache-one-load-across-instances-and-no-outdated-values). |
| `shards` | `{ name, size, connection }[]`: spread keys over these nodes instead of `connection`. See [Sharding](#sharding-over-several-valkey-nodes). |
| `invalidateEveryNode` | With `shards`, invalidate each key on every node, so changing the nodes is safe. See [Changing the nodes safely](#changing-the-nodes-safely). |
| `onLoadError` | Called when a load fails, including background refreshes, whose errors no caller sees. |
| `emitter` | Receives BentoCache's events (`cache:hit`, `cache:miss`, `cache:written`...), e.g. for metrics. |

Each option picks one of the [haywire](/haywire/) bindings the cache is built from. To swap in your own, or to resize the nodes while running, compose them directly: see [Composing with haywire](#composing-with-haywire).

## Reading values

### Resources: keys derived from inputs

`cache.resource({ key, load, ttlMs? })` defines a kind of value once: how its key is derived from an input, and how it is loaded. Reads, `expire` and `invalidate` then take the input, never a key. The same idea as [normalized-react-query](/normalized-react-query/)'s resources, for the same reason: when every call site builds a key and passes a loader, nothing stops one of them from pairing a key with the wrong loader (or a typo in the key), and the cache then serves one thing under another's key.

Every input that loads a different value must give a different key, and two resources in one cache must not produce the same key: include the kind of value in it (`user:${id}`, `team:${id}`).

`cache.get(key, load, options?)` is still there, for one-off reads, and is what resources call.

### TTL per value

`ttlMs` on a resource (or in `get`'s options) replaces the cache's `ttlMs`. It is a number, or a function of the loaded value (and, for a resource, the input), e.g. to cache a missing row for less time than a found one, or to cache by how often a kind of row changes.

It is applied after the load, through BentoCache's `ctx.setOptions({ ttl })`, so every tier BentoCache writes keeps the value that long. With leases, lease-cache computes the TTL for the value it stores, and the memory tier keeps each value only as long as lease-cache has left on it (a value read from lease-cache an hour into its TTL doesn't get a fresh one in memory). A load that fails is never cached; to cache a failure for a short while, return it as a value (`{ error: 'not-found' }`) and give it a short TTL.

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

BentoCache's `getOrSet` is the whole read-through pattern: look in each tier, call the factory on a miss, write the result back. It also takes a per-key lock within the process, so 100 concurrent requests for a missing key in one instance call the loader once. This is always on.

`null` is cached like any other value, which is what you want for "this row doesn't exist" lookups: without it, every request for a missing row reaches the database. `undefined` can't be cached.

When the loader throws, nothing is cached, and the caller gets BentoCache's `errors.E_FACTORY_ERROR`, with what the loader threw as its `cause`.

### Memory tier, and keeping it in sync

`memory: { maxItems }` (`memoryTierBinding`) adds an LRU in each instance, in front of Valkey. Reads that hit it never leave the process.

The cost: when a key changes, other instances keep their copy until it expires. `memory: { maxItems, sync: true }` (`syncedMemoryTierBinding`) fixes that with BentoCache's bus: every write, expire or delete is published over Valkey pub/sub, and every other instance drops its copy.

Learned along the way:

- **The bus channel is named after the store**, so caches with different prefixes but the same store name share a channel. They don't interfere, since each message is tagged with its prefix and ignored by caches with another, but every instance still receives every cache's messages. Naming the store after the prefix gives each cache its own channel.
- **The bus subscribes in the background.** An instance can miss messages published in its first moments. The tests wait for the subscription (`PUBSUB NUMSUB`) rather than assume it.
- The bus opens two connections (publisher and subscriber), duplicated from the application's connection. It closes them when the cache's container is disposed, and leaves the application's connection open.

### Stale-while-revalidate

`staleWhileRevalidate: { graceMs }` (`staleWhileRevalidateBinding`) keeps entries for `graceMs` after they were loaded, even once their `ttlMs` has passed. A read of an expired entry returns it immediately, and refreshes it in the background. If the refresh fails, the stale value keeps being served, and `onLoadError` is the only place the failure shows up (no caller is waiting on it).

- **`graceMs` counts from when the value was loaded**, not from when it expired: BentoCache sets the entry's physical TTL to `graceMs`. So it must be longer than `ttlMs` to do anything.
- **With lease-cache as the shared tier, stale values only live in memory** (see [lease-cache](#lease-cache-one-load-across-instances-and-no-outdated-values)), so this also needs a memory tier.
- BentoCache's `timeout` option controls how long a read waits for the fresh value before falling back to the stale one. It is fixed at `0` here: return stale right away.
- `expire(key)` marks a value stale without deleting it, so the next read still gets an answer instantly. `invalidate(key)` deletes it. With `waitForFreshBinding`, the two are the same.

### lease-cache: one load across instances, and no outdated values

BentoCache's own Valkey tier leaves two gaps, which [lease-cache](/lease-cache/) closes:

- **Every instance loads a shared miss.** BentoCache's lock only works within one process. When a popular key expires, every instance misses it at once, and each calls the loader.
- **A load that finishes after an invalidation caches what it read.** A read misses and starts loading the old row. Meanwhile, the row is updated and the key invalidated. The read then caches the old row, until it expires. A test shows this happening with BentoCache's own tier, and not with lease-cache.

`leases: { leaseMs, pollMs, waitMs }` (`leaseCacheTierBinding`) makes lease-cache the shared tier, in place of BentoCache's. The first reader to miss takes a lease in Valkey and loads. Others wait for its value. The value is cached only if the lease still holds the reader's token, and `invalidate` deletes value and lease together, so a load from before the invalidation can't cache. [Why lease-cache](/lease-cache/why) has the argument for why that is enough, and what it relies on.

BentoCache then keeps only what lease-cache doesn't do: the memory tier, its sync, and grace periods. So:

- **Stale values on expiry only live in memory.** lease-cache keeps no stale copy of a value that runs out, so stale-while-revalidate needs a memory tier. A refresh then still loads once across instances: the others' background refreshes wait on the lease, and pick up its value.
- **After `expire()` or `invalidate()`, lease-cache can keep the old value**: `leases: { ..., staleMs }`. Instances that would wait on the next load return it instead, with or without a memory tier.
- **BentoCache gets no Valkey layer at all**, so it can't cache an outdated value behind lease-cache's back.
- **The memory tier only keeps what lease-cache cached.** lease-cache's `read()` says whether, and for how long, it cached each value. A load that lost its lease to an invalidation, a stale value, and a load after `waitMs` aren't cached by lease-cache, so the factory skips BentoCache's cache for them too (`ctx.skip()`): the value is returned, and kept by no tier. Without that, the memory tier would keep exactly the outdated load lease-cache refused, for the whole TTL. Tests show both, with a memory tier.

Learned along the way:

- **Don't wrap the loader with a lock and let BentoCache write.** The first version of this demo did, with its own lease around the loader. BentoCache writes the value *after* the factory returns, so the lease could never be released on success (a waiting instance would take it, find nothing, and load again), and the write can't be made conditional on still holding the lease, so the invalidation race stayed open. Making lease-cache the tier puts the check and the write in one step.
- **BentoCache gives background refreshes no `gracedEntry`**, so a factory can't tell a refresh (whose caller already has a stale value) from a reader with nothing to return. Reported upstream as [Julien-R44/bentocache#124](https://github.com/Julien-R44/bentocache/pull/124).

### When Valkey is down

What happens depends on the shared tier, and on whether there is a memory tier:

| | Valkey down |
|---|---|
| BentoCache's own tier, no memory tier | Every read fails (`E_L2_CACHE_ERROR`). |
| BentoCache's own tier, with a memory tier | Reads go past Valkey: BentoCache skips its errors when it has a memory tier, and keeps what it loads there. |
| lease-cache | Every read fails (`E_FACTORY_ERROR`, with Valkey's error as its cause). |
| lease-cache, with `fallback` | Reads keep working, from an LRU in each instance's memory ([`lru-cache`](https://www.npmjs.com/package/lru-cache)). |

`leases: { ..., fallback: { maxItems, ttlMs, onUnavailable? } }` keeps a loaded value in an LRU for `ttlMs` when Valkey fails, and reads from it until Valkey is back. It's separate from the memory tier, which only keeps what lease-cache cached, and it costs what an outage costs:

- **Each instance loads on its own.** There are no leases without Valkey, so a miss is loaded once per instance, not once overall.
- **Invalidations don't reach other instances.** `invalidate()` drops the key from this instance's LRU, then rejects, as lease-cache can't delete it. Every other instance serves its copy until `ttlMs` passes, which is why it should be short.
- **A value loaded just before Valkey failed is kept**, rather than loaded again.

Without `fallback`, the cache is exactly as available as Valkey, which is the right choice when serving data a few seconds old is worse than failing. lease-cache's own [`onUnavailable`](/lease-cache/) is the middle ground: reads keep working, without caching anything.

### Sharding over several Valkey nodes

BentoCache's Redis driver talks to one server, or to a Redis Cluster (Valkey cluster mode), which places keys by hash slot and needs every node configured as a cluster. [`ShardedValkeyDriver`](https://github.com/JacobLey/leyman/tree/main/demos/read-through-cache/src/lib/sharded-valkey-driver.ts) spreads keys over independent servers instead, as a custom BentoCache L2 driver. It picks each key's server with [`weighted-rendezvous-hash`](https://github.com/JacobLey/leyman/tree/main/tools/constant-consistent-hash/weighted-rendezvous-hash), then delegates to BentoCache's own Redis driver for that server, so values are stored exactly as BentoCache would store them. A single node is just a topology of one, through the same driver.

For a fixed set of nodes, pass the application's connections as `shards`:

```ts
import type { Redis } from 'ioredis';
import { createReadThroughCache } from '@leyman/demo-read-through-cache';

declare const valkey: Redis;
declare const cacheA: Redis;
declare const cacheB: Redis;
// ---cut---
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

Options (and a container's bindings) are fixed once the cache is built, so nodes that change while the application runs can't come from them. The application creates a `ResizableValkeyTopology` itself (it opens a connection per node, and closes them when disposed), [binds](#composing-with-haywire) the instance, and resizes it:

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
    .addBinding(bind(cacheConfigId).withInstance({ prefix: 'app', ttlMs: 60_000 }))
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
- **Moved keys are left behind.** They aren't deleted from their old node, just never read there.

#### Changing the nodes safely

Instances don't change their node lists at the same moment. While a change rolls out, two instances can place a key on different nodes, and an invalidation from one only reaches the node it knows: the other keeps serving its copy until it expires. A node removed and added back can also serve values from before it left. Two habits close both:

1. **Nodes join and leave at size `0`.** Add a node at size `0` (connected, holding no keys) and roll that out to every instance before giving it a size. To remove one, drain it to `0`, wait the longest TTL, then remove it. Each instance then knows every node that might hold a key, and nothing outlives its drain.
2. **Invalidate on every node**, with `invalidateEveryNode` (an option of `createReadThroughCache` with `shards`, and of `rendezvousTopology` and `ResizableValkeyTopology`). Each invalidation and `expire()` then goes to every node, at one round trip per node, and reaches every copy.

The tests show both: an invalidation from an instance with the old list misses the copy on the new node by default, and reaches it with `invalidateEveryNode`.

With `invalidateEveryNode`, `ResizableValkeyTopology.resize()` refuses a step that skips size `0`: a node that joins with a size (or moves to another URL), or one removed before it is drained. How long to wait between steps is left to you. No instance can tell when every other instance has the change, or which of two node lists is the newer, so a check across instances (comparing fingerprints of each one's node list) could report a rollout in progress, but not make it safe.

For nodes that only grow and shrink at the end of a list, [`constant-consistent-hash`](https://github.com/JacobLey/leyman/tree/main/tools/constant-consistent-hash/constant-consistent-hash) places keys in constant time instead.

## Composing with haywire

`createReadThroughCache` is a shortcut. The cache is [haywire](/haywire/) bindings, and each option picks one: `readThroughCacheModule` holds the cache itself, and needs one binding for each setting the application provides, and one for each feature. Compose them directly to bind something the options can't express (a `ResizableValkeyTopology`, your own memory tier), or to share bindings with the rest of an application built with haywire:

```ts
import type { Redis } from 'ioredis';

declare const valkey: Redis;
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

| Id | Bound by | Choices |
|---|---|---|
| `cacheConfigId` | the application | `{ prefix, ttlMs, onLoadError?, emitter? }` |
| `valkeyConnectionId` | the application | Its own connection. Needed by `singleNodeTopologyBinding` and `syncedMemoryTierBinding` |
| `valkeyShardId` (a list) | the application | `{ name, size, connection }`, one binding per node. Needed by `shardedTopologyBinding` |
| `valkeyTopologyId` | a feature | `singleNodeTopologyBinding` · `shardedTopologyBinding` · a `ResizableValkeyTopology` instance (see [Sharding](#sharding-over-several-valkey-nodes)) |
| `sharedTierId` | a feature | `bentoValkeyTierBinding` (BentoCache's own Valkey tier) · `leaseCacheTierBinding({ leaseMs, pollMs, waitMs, staleMs?, fallback? })` |
| `memoryTierId` | a feature | `noMemoryTierBinding` · `memoryTierBinding({ maxItems })` · `syncedMemoryTierBinding({ maxItems })` |
| `expiryPolicyId` | a feature | `waitForFreshBinding` · `staleWhileRevalidateBinding({ graceMs })` |

A missing or doubled choice is a type error, and every combination works. Each feature is one small binding, so the code for, say, the memory tier is all in [`src/lib/memory-tier.ts`](https://github.com/JacobLey/leyman/tree/main/demos/read-through-cache/src/lib/memory-tier.ts).

`createReadThroughCache` itself ([`src/lib/create.ts`](https://github.com/JacobLey/leyman/tree/main/demos/read-through-cache/src/lib/create.ts)) starts from every feature off, and swaps in a binding per option with `replaceBinding()`. A replacement keeps the module's type, so haywire still checks the result is complete. (Adding a different binding in each branch of an `if` doesn't: each combination would be its own module type.)

**Who closes what** follows from how each value was bound. Every Valkey connection is the application's, bound with `withInstance()`, which a container never closes: the cache can share a connection with anything else (a rate limiter, another cache). Disposing the container (or `close()`) closes only what BentoCache opened itself: the bus's pub/sub connections. The Valkey driver never closes connections.

## Not covered

- **Loads from a lagging replica.** lease-cache's guarantee assumes a load that starts after an invalidation reads the change. One that reads a replica behind the primary can still cache the old row.
- **Batch loads.** Reading many keys with one query for the missing ones (DataLoader-style) isn't supported by BentoCache's `getOrSet`.
- **Caching failures.** A load that throws is never cached. Return a failure as a value, with a short [TTL](#ttl-per-value), to cache it.
- **Values from an older deploy.** The cache trusts that what it reads has the current shape. Put a version in `prefix` when the shape of a value changes.

## Testing

The tests run against a real Valkey: a `valkey` sidecar in the devcontainer, and a service bound under the same hostname in Dagger. Nothing in this demo is mocked.

- **Several databases stand in for several servers.** Nodes in the tests are logical databases `1` to `4` of one server: they never share keys, which is all sharding needs.
- **Tests vary one feature at a time.** Each starts from a baseline module (one node, BentoCache's own Valkey tier, no memory tier, no grace), and swaps in the feature it is about with `replaceBinding()`, which haywire type-checks like any other binding. `createReadThroughCache` gets its own tests, of each option.
- **Each instance stands in for a process.** Two containers in one test share no BentoCache, memory tier or locks, only Valkey, like two pods. (They do share the application's connection, as a stand-in for Valkey itself.)
- **Tests order events, never wait on time.** The loader is controlled by the test ([`test/helpers/loader.ts`](https://github.com/JacobLey/leyman/tree/main/demos/read-through-cache/test/helpers/loader.ts)): each call stays pending until the test resolves it. Background work is awaited through events: lease-cache's `onWait` when an instance waits on another's lease, and BentoCache's `cache:written` when a refresh lands. TTLs and leases are long enough to never run out during a test, and expiry is triggered with `expire()` instead.
- **Every test uses its own prefix**, so tests never need to clear the server, and never see each other's keys.
