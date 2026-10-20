---
description: Read-through caching on Valkey or Redis with leases, so each miss is loaded once across every instance, and a load that finishes after an invalidation never caches its outdated value.
---

# lease-cache

Read-through caching on Valkey or Redis with leases: one load per key across every instance, and a load that finishes after an invalidation never caches its outdated value.

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

**[Get started →](/lease-cache/getting-started)**

## Features

- **One load per key, across every instance**: the first reader to miss takes a lease and loads. Readers in every other process wait for its value instead of loading too.
- **No outdated values after an invalidation**: a load that started before `invalidate()` returns to its caller, but can't cache what it read. See [Invalidation](/lease-cache/guides/invalidation).
- **Optionally, no waiting after an invalidation**: with `staleMs`, the old value is kept as stale, and readers that would wait on the next load return it instead.
- **A failed or stuck load holds no one up for long**: a failed load frees its lease right away, and readers stop waiting after `waitMs`.
- **No client dependency**: anything with an `eval` command works, such as an ioredis `Redis` or `Cluster`. Keys use hash tags, so it works on a cluster.

Leases are the mechanism memcache uses at Facebook ([Scaling Memcache at Facebook](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf), section 3.2.1), done here with a few small Lua scripts. It is the narrow part of a cache, not a whole one: pair it with a fuller cache for a memory tier or stale-while-revalidate on expiry, as the [read-through cache demo](/demos/read-through-cache) does with BentoCache.

## Compared to

| | lease-cache | BentoCache, cache-manager, cachified |
|---|---|---|
| Concurrent misses in one instance | one load | one load |
| Concurrent misses across instances | one load | one per instance |
| Load finishing after an invalidation | not cached | cached until it expires |
| Memory tier, stale-while-revalidate on expiry, many stores | ❌ | ✅ |

See [Why lease-cache](/lease-cache/why) for the full comparison.
