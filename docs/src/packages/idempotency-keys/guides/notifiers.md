---
description: Wake a waiting duplicate as soon as the running request ends, on any instance, with Postgres LISTEN/NOTIFY or Valkey pub/sub. Waiting requests still poll without one.
---

# Notifiers

A duplicate of a running request waits for it, up to `waitMs`. While it waits it claims the key again on a schedule: 50 ms after its first try, then waiting twice as long each time, up to a second between tries. So without a notifier, a duplicate answers up to a second after the first request ends.

A notifier wakes it at once. After every request that completes or releases its key, the server publishes the key's identity on a channel. Every server listening wakes its requests waiting on that identity, and they claim again from the store.

The store stays the source of truth. A woken request reads the store, and a waiting request keeps polling whether or not a notifier is set, so a notifier that is down, or loses a message, only makes waiting slower. Either notifier works with either store.

## Postgres

```ts
import pg from 'pg';
import { IdempotencyKeys, PostgresNotifier, PostgresStore } from 'idempotency-keys';

declare const databaseUrl: string;
declare const logger: { error: (error: unknown) => void };
// ---cut---
const pool = new pg.Pool({ connectionString: databaseUrl });

// A connection of its own, as LISTEN belongs to one connection
const listener = new pg.Client({ connectionString: databaseUrl });
await listener.connect();

const keys = new IdempotencyKeys({
    store: new PostgresStore({ client: pool }),
    notifier: await PostgresNotifier.listen({
        publisher: pool,
        listener,
        onError: error => logger.error(error),
    }),
});
```

It announces with `SELECT pg_notify(channel, identity)` on `publisher`, and hears with `LISTEN` on `listener`. One listening connection serves every waiting request of the process. The listener must be a `pg` `Client` rather than a pool.

`pg` doesn't reconnect a client that fails (Postgres restarted, or ended the connection). The notifier reports the failure to `onError`, rather than letting `pg` throw its `error` event and crash the process, and waiting requests then only poll. To get notifications back, connect a new client, call `listen` again, and `close()` the old notifier.

## Valkey

```ts
// @filename: node.d.ts
// Docs are type-checked without Node.js types, which ioredis's Redis extends
declare module 'events' {
    export class EventEmitter {
        on(event: string | symbol, listener: (...args: any[]) => void): this;
        off(event: string | symbol, listener: (...args: any[]) => void): this;
    }
}
// @filename: index.ts
import { Redis } from 'ioredis';
import type { IdempotencyStore } from 'idempotency-keys';
import { IdempotencyKeys, ValkeyNotifier } from 'idempotency-keys';

declare const store: IdempotencyStore;
// ---cut---
const publisher = new Redis('redis://valkey:6379');
// A connection of its own, as subscribing takes it over
const subscriber = new Redis('redis://valkey:6379', { lazyConnect: true });
await subscriber.connect();

const keys = new IdempotencyKeys({
    store,
    notifier: await ValkeyNotifier.listen({ publisher, subscriber }),
});
```

It announces with `PUBLISH channel identity` on `publisher` (any connection, such as the store's), and subscribes on `subscriber`. An ioredis `Redis` subscribes again by itself after reconnecting. Wait for it to be ready, as above, before listening.

## Channels and closing

Both use the channel `idempotency_keys` unless given `channel`. Every server sharing keys must use the same one. A Postgres channel is quoted, so it is case-exact and at most 63 bytes.

`close()` stops listening (a Postgres notifier runs `UNLISTEN`, a Valkey one unsubscribes). Waiting requests go on polling. Neither notifier ever closes the connections it was given.

## Without a notifier

Leave `notifier` out, and waiting requests only poll. That is a fine choice when duplicates are rare, or when the server has no connection of its own to listen on. The [OpenAPI demo](/demos/openapi/) runs without one for that reason.

A failed announcement doesn't fail the request, whose key was already completed or released. It goes to `onError`, and other servers notice by polling.
