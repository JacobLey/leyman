---
description: The race between a slow load and an invalidation, how lease-cache closes it, serving stale values while the next load runs, and what the guarantee relies on.
---

# Invalidation

## The race

The usual way to keep a cache current is to invalidate a key after changing its data. In most read-through caches, a load already in progress undoes that:

```
reader                        writer
──────                        ──────
miss, start loading
  read the row (old)
                              update the row
                              invalidate the key
  cache what was read (old)
```

The invalidation happened, yet the old row is cached, and served until it expires.

## How leases close it

The reader that misses takes a lease: a random token, stored next to the value. When its load finishes, it caches the value only if the lease still holds its token, in one atomic step. `invalidate` deletes the lease along with the value, so in the race above the reader's check fails, and nothing is cached:

```ts
import type { LeaseCache } from 'lease-cache';

declare const cache: LeaseCache;
declare const readRow: () => Promise<string>;
declare const updateRow: () => Promise<void>;
// ---cut---
// A read misses, and starts loading the row as it was before an update
const outdated = cache.get('key', readRow);

// The row is updated, and the key invalidated
await updateRow();
await cache.invalidate('key');

// The slow load still returns what it read to its caller...
await outdated;
// ...but cached nothing: the next read loads the new row
await cache.get('key', readRow);
```

`invalidate` also frees the lease, so the next reader loads right away, rather than waiting on a load already known to be outdated.

## Serving stale values while the next load runs

After an invalidation, the next reader loads the new value, and every other reader waits for it. With `staleMs`, `invalidate` keeps the old value as stale for that long, and readers that would wait return it immediately instead:

```ts
import type { LeaseCacheConnection } from 'lease-cache';

declare const connection: LeaseCacheConnection;
// ---cut---
import { LeaseCache } from 'lease-cache';

const cache = new LeaseCache({
    connection,
    prefix: 'users',
    ttlMs: 60_000,
    leaseMs: 5000,
    pollMs: 50,
    waitMs: 2000,
    // Keep an invalidated value for 10 seconds, for readers that would wait on the next load
    staleMs: 10_000,
});
```

- **Only the lease holder loads.** It doesn't get the stale value: it returns what it loaded.
- **A stale value is returned, never cached.** Once the new value is cached, the stale one is deleted, so a reader is never handed a value older than one cached since.
- **Only after an invalidation.** A value that expires (`ttlMs`) leaves no stale copy. For stale-while-revalidate on expiry, put a cache with grace periods in front, like BentoCache in the [read-through cache demo](/demos/read-through-cache/).

Use it for reads that can live with data from just before the change. Leave it off (the default) for reads that must see the change once `invalidate` returns.

## What the guarantee relies on

Once `invalidate(key)` returns, no load that started before it can cache a value for the key. For the reasoning, see [Why lease-cache](/packages/lease-cache/why#why-it-is-correct). That only means the cache is current if:

- **You invalidate after the change is committed.** Invalidating first leaves a window where a new load reads the old data and caches it, as with any cache.
- **Loads read current data.** A load from a lagging read replica can still read the old row after the invalidation. Load from the primary, or accept staleness up to the replica's lag.
- **Every change invalidates.** A change that never calls `invalidate` stays cached until `ttlMs`.

It holds without extra care when a load outlives its lease (another reader may load too, but the first one's fill fails), when a lease holder crashes (its lease runs out after `leaseMs`), and whatever the clients' clocks say (Valkey measures every expiry).
