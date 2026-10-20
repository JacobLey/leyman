---
description: Install lease-cache, connect it to Valkey or Redis, then read through it and invalidate.
---

# Getting started

## Install

::: code-group

```sh [npm]
npm i lease-cache
```

```sh [pnpm]
pnpm add lease-cache
```

```sh [yarn]
yarn add lease-cache
```

:::

::: tip
lease-cache is ESM only, for Node.js 24 or later. It has no dependencies: bring your own Valkey or Redis client.
:::

## Create a cache

Pass a connection, a prefix for the cache's keys, and how long values and leases last:

```ts
import { Redis } from 'ioredis';
import { LeaseCache } from 'lease-cache';

const cache = new LeaseCache({
    connection: new Redis('redis://valkey:6379'),
    prefix: 'users',
    // How long a loaded value is cached
    ttlMs: 60_000,
    // How long a reader may load before another can take over: longer than a load usually takes
    leaseMs: 5000,
    // How often a reader waiting on another's load checks again
    pollMs: 50,
    // How long a reader waits on another's load before loading itself (without caching)
    waitMs: 2000,
});
```

The connection only needs an `eval` method, so an ioredis `Redis` or `Cluster` fits as it is. The cache never closes it, so it can be shared with anything else using the server.

## Read through it

`get` returns the cached value, or calls the loader and caches what it returns:

```ts
import type { LeaseCache } from 'lease-cache';

type User = { readonly id: number; readonly name: string };
declare const db: { users: { find: (id: number) => Promise<User | null> } };
declare const cache: LeaseCache;
declare const id: number;
// ---cut---
const user = await cache.get(`user:${id}`, async () => db.users.find(id));
//    ^?
```

When several instances miss the key at once, only one loads it. The others wait for its value, checking every `pollMs`.

Values are stored as JSON, so loaders must return JSON-compatible values (the `Json` type): a `Date` would come back as a string. `null` is cached like any other value, so a missing row isn't looked up again on every read.

```ts
import type { LeaseCache } from 'lease-cache';

declare const cache: LeaseCache;
// ---cut---
// @errors: 2322
await cache.get('now', async () => new Date());
```

## Invalidate after a change

Call `invalidate` after the source of truth changes, once the change is committed:

```ts
import type { LeaseCache } from 'lease-cache';

declare const db: { users: { update: (id: number, changes: { name: string }) => Promise<void> } };
declare const cache: LeaseCache;
declare const id: number;
// ---cut---
await db.users.update(id, { name: 'Ada' });
await cache.invalidate(`user:${id}`);
```

The next read loads the new value. A load that was already running when you invalidated still returns to its caller, but caches nothing, since it may have read the row from before the change.

## Next steps

- [Invalidation](/lease-cache/guides/invalidation): the race leases close, stale values, and what the guarantee relies on.
- [API reference](/lease-cache/reference/api): every option.
- [Read-through cache demo](/demos/read-through-cache): lease-cache under BentoCache's memory tier and stale-while-revalidate.
