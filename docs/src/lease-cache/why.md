---
description: The stampede and invalidation race in read-through caches, how leases solve both, why one token check is enough, and how lease-cache compares.
---

# Why lease-cache?

## The Problem

A read-through cache returns the cached value, or loads it on a miss and caches it. Two things go wrong once several instances (processes, pods) share the cache.

**Every instance loads the same miss.** When a popular key expires, every instance misses it at once, and each sends the same query to the database: a stampede. Most libraries merge concurrent misses *within* an instance, so 100 requests in one process become one load. With 20 instances, the database still sees 20.

**A slow load caches outdated data.** The usual way to keep a cache current is to invalidate a key after changing its data. But a load already in progress can undo that:

```
reader                        writer
──────                        ──────
miss, start loading
  read the row (old)
                              update the row
                              invalidate the key
  cache what was read (old)
```

The invalidation happened, yet the old row is now cached, and served until it expires. Nothing is wrong with either side: the reader read before the update, and the writer invalidated after it. The race is between the reader's read and its write to the cache.

Both are well known, and [memcache at Facebook](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf) (Nishtala et al., NSDI 2013, section 3.2.1) solves both with one mechanism: **leases**. This package implements them on Valkey (or Redis).

## How it works

Each key has a value and a lease, stored next to each other. A lease is a random token, with an expiry.

1. **Read or lease.** A reader that finds the value returns it. On a miss, it takes the lease with its own token (`SET lease token NX PX leaseMs`), unless another reader holds it.
2. **Load and fill.** The lease holder loads the value, then caches it *only if the lease still holds its token*, and frees the lease in the same step.
3. **Wait.** A reader that finds the lease taken checks again every `pollMs`, and returns the value once the holder caches it.
4. **Invalidate** deletes the value and the lease together.

With `staleMs`, step 4 first copies the value to a stale key that lives for `staleMs`, and a reader in step 3 returns it instead of waiting. The lease holder still loads, and its fill deletes the stale value. This is memcache's "stale values" (section 3.2.1 again): for reads that can live with data from just before the change, an invalidation then costs no waiting.

Each step is one Lua script, which Valkey runs atomically: no other command runs between its check and its write.

The stampede is gone because only the lease holder loads: every other instance waits for its value. The race is gone because of step 2's check, below.

## Why it is correct

**Claim:** once `invalidate(key)` returns, no load that started before it can cache a value for `key`.

1. A value is only cached by a fill, and a fill only succeeds if the lease holds the filler's token at that moment.
2. `invalidate` deletes the lease. Tokens are random and never reused, so once the lease is deleted, no existing token can match it again. Any later lease holds a new token.
3. So a fill that succeeds after an invalidation belongs to a lease taken after the invalidation, and its reader took the lease before it started loading.
4. That load therefore started after the invalidation, and so after the change it was invalidated for. It reads the new data.

The fill that loses its lease still returns what it loaded to its own caller. That value was current when the read began, which is all any read without a lock can promise.

**What it relies on:**

- **Invalidate after the change is committed.** Invalidating first leaves a window where a new load reads the old data and caches it, as with any cache.
- **Loads read committed, current data.** A load that reads from a lagging replica can still read the old row after the invalidation. memcache handles this with "remote markers" between regions. This package doesn't, so load from the primary (or accept staleness up to the replica's lag).
- **A cache in front keeps only what this one cached.** A memory tier that keeps every value `get` returns would keep the very load an invalidation stopped from caching. `read()` says whether, and for how long, Valkey caches each value, so the tier in front can keep it no longer (and not at all when it isn't cached).
- **Every change invalidates.** A change that never calls `invalidate` stays cached until `ttlMs`, as with any cache.

**What is safe without extra care:**

- **A load that outlives its lease.** Another reader may take the lease and load too: a duplicate load, never a wrong value, since the first reader's fill then fails its check. Set `leaseMs` above the usual load time to keep it rare.
- **Clocks.** Lease and value expiry are measured by Valkey. No client clock decides correctness.
- **A reader that stops waiting** (`waitMs`) loads without a lease, and so never caches. Its value is current when its read began.
- **Stale values** (`staleMs`) are only returned to readers that would otherwise wait, never cached as the value, so the claim above still holds. Each fill deletes the stale value, so a reader is never handed one older than a value cached since.
- **A crashed holder** leaves a lease that runs out after `leaseMs`, then a waiting reader takes over.
- **Valkey going down.** Reads reject, or with `onUnavailable` load without caching, which caches nothing it could later serve wrong. `invalidate()` always rejects, so a writer knows when an invalidation didn't happen.

## Design decisions

- **Lua scripts, not a client library.** Each step needs a check and a write with nothing in between, which a script gives in one round trip. The only command needed is `EVAL`, so any Valkey or Redis client works (`LeaseCacheConnection` is that one method). It has ioredis's signature, so ioredis and iovalkey fit as they are, and other clients need a few lines, each tested. A client that runs scripts by hash, like Valkey GLIDE, keeps doing so behind its adapter, which is why the interface has no `EVALSHA` of its own.
- **Hash tags.** The value, lease and stale value keys share a `{key}` tag, so a cluster places them on the same node, which a script touching several requires. A key that is empty or starts with `}` would have an empty tag, and a prefix with `{` would change the tag, so both are rejected.
- **Polling, not pub/sub.** A waiting reader checks again every `pollMs`. Pub/sub would answer faster, but needs a subscriber connection per process and handling for messages missed while subscribing. Waits are short (one load), so a few cheap `GET`s each are simpler.
- **`invalidate` frees the lease too.** The next reader takes a new lease and loads right away, rather than waiting on a load already known to be outdated.
- **Stale values only after an invalidation, and opt-in.** A value that expires on its own has no stale copy: `ttlMs` is the longest a value may be served, and stale-while-revalidate on expiry belongs to the cache in front (e.g. BentoCache's grace periods). An invalidation is different: the data is known to have changed, and only the caller knows whether the old value is still useful for a moment.
- **JSON values.** One format every client can read, and `null` caches like any value, so a missing row isn't looked up again on every read.

## Compared to alternatives

As of October 2026:

| | lease-cache | [BentoCache](https://bentocache.dev) | [cache-manager](https://github.com/jaredwray/cacheable) | [cachified](https://github.com/epicweb-dev/cachified) |
|---|---|---|---|---|
| Concurrent misses in one instance | one load | one load | one load | one load |
| Concurrent misses across instances | one load | one per instance | one per instance | one per instance |
| Load finishing after an invalidation | not cached | cached until it expires | cached until it expires | cached until it expires |
| Stale values while the next load runs | after an invalidation (`staleMs`) | grace periods | some | `staleWhileRevalidate` |
| Memory tier, stale-while-revalidate on expiry, tags | ❌ | ✅ | some | some |
| Stores | Valkey, Redis | many | many (Keyv) | many (adapters) |

BentoCache's maintainer considered distributed locks and decided against them for now ([Julien-R44/bentocache#2](https://github.com/Julien-R44/bentocache/issues/2)). A distributed lock (e.g. Redlock) around the loader stops the stampede, but not the race: the lock decides who loads, not whether the result may still be cached.

lease-cache is the narrow part: it composes with a fuller cache rather than replacing one. The [read-through cache demo](/demos/read-through-cache) makes it the shared tier under BentoCache's memory tier and stale-while-revalidate.

## Non-goals

- **A full cache.** No in-memory tier, tags, or storage other than Valkey/Redis.
- **Mutual exclusion.** A lease that runs out lets a second load start. It saves load, and protects what is cached, but it is no lock for side effects that must never run twice.
- **Consistency across regions** or with lagging replicas (see [what it relies on](#why-it-is-correct)).
