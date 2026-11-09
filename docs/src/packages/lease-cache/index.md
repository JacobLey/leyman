---
description: A read-through cache for Valkey or Redis that shares one load per key across all your servers, and handles invalidating a key while it loads.
---

# lease-cache

<ProjectHeader />

A read-through cache for Valkey or Redis that shares one load per key across all your servers, and handles invalidating a key while it loads.

A read-through cache returns the cached value, or on a miss runs the "expensive" load (usually a database query) and caches what it returns. Most caching libraries let parallel misses in one process share a single load, but with 20 servers the database still sees 20 queries.

lease-cache shares the load across servers by keeping a "lease" next to each key in Valkey (or Redis). The first read to miss takes the lease and runs the load, and reads on every other server wait for its value. Since `invalidate()` removes the lease along with the value, a load that was already running when you invalidated still returns its result, but doesn't cache a value that may be out of date (see [Invalidation](/packages/lease-cache/guides/invalidation)).

```ts
type User = { readonly id: number; readonly name: string };
declare const db: {
    users: {
        find: (id: number) => Promise<User | null>;
        update: (id: number, changes: Partial<User>) => Promise<void>;
    };
};
declare const id: number;
// ---cut---
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
//    ^?

await db.users.update(id, { name: 'Ada' });
await cache.invalidate(`user:${id}`);
```

**[Get started →](/packages/lease-cache/getting-started)**

## Features

- With `staleMs`, an invalidated value is kept as stale for a while, and readers that would wait on the next load return it instead.
- When a load fails, its lease is freed right away so another read can try. A reader that has waited `waitMs` stops waiting and runs the load itself, without caching the result.
- Any client with an `eval` command works. ioredis and iovalkey fit as they are, and node-redis and Valkey GLIDE need a few lines (see [Clients](/packages/lease-cache/guides/clients)).
- Keys use hash tags, so it works on a cluster.

Leases are how memcache at Facebook solves the same problems ([Scaling Memcache at Facebook](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf), section 3.2.1), and lease-cache implements them with a few small Lua scripts. It only covers this part of caching, without a memory tier or stale-while-revalidate on expiry. For those, put it under a fuller cache, as the [read-through cache demo](/demos/read-through-cache/) does with BentoCache.

## Compared to

|                                                            | lease-cache | BentoCache, cache-manager, cachified |
| ---------------------------------------------------------- | ----------- | ------------------------------------ |
| Concurrent misses in one instance                          | one load    | one load                             |
| Concurrent misses across instances                         | one load    | one per instance                     |
| Load finishing after an invalidation                       | not cached  | cached until it expires              |
| Memory tier, stale-while-revalidate on expiry, many stores | ❌          | ✅                                   |

See [Why lease-cache](/packages/lease-cache/why) for the full comparison.

## Related

<ProjectRelated />
