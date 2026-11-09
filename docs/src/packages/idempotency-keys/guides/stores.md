---
description: Choosing between the Postgres store (strict and durable) and the Valkey store (lax), connecting each, and when not to use Valkey.
---

# Stores

A store holds one record per key: running (claimed by one request, holding its lease) or completed (holding its response). Every time comes from the store's own clock rather than a server's, so servers whose clocks drift still agree on every lease.

|                           | `PostgresStore`                                            | `ValkeyStore`                                             |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| A claim is                | A row written by one `INSERT ... ON CONFLICT` statement    | A hash written by one Lua script                          |
| After a crash or failover | The key is still there                                     | A failover that loses writes, or a flush, forgets the key |
| Expired keys              | Stay until overwritten or `deleteExpired()`                | Expire with their time to live                            |
| Clock                     | `clock_timestamp()`                                        | `TIME`                                                    |
| Client                    | Anything with `query(text, values)`, such as a `pg` `Pool` | Anything with `eval`, replying with bytes                 |

## Postgres

Postgres is the strict store, and the one to use unless the writes are cheap to repeat. A claim is a committed row, so it is exclusive and survives a restart.

```ts
import pg from 'pg';
import { IdempotencyKeys, PostgresStore } from 'idempotency-keys';

declare const databaseUrl: string;
// ---cut---
const pool = new pg.Pool({ connectionString: databaseUrl });
const keys = new IdempotencyKeys({
    store: new PostgresStore({ client: pool, table: 'idempotency_keys' }),
});
```

The table comes from [`createTableSql()`](/packages/idempotency-keys/reference/api#createtablesql-table), in a migration. Its name is quoted as given, so it is case-exact and at most 63 bytes (past which Postgres would silently cut it down to another name). It can't name a schema, so a table in another schema is found through the client's `search_path`. The store never closes the client, so it can share the pool your handlers use.

Every time is `clock_timestamp()`, the time of the statement, rather than `now()`, the time its transaction started, because a client inside a long transaction would otherwise write leases that had already run out.

Postgres doesn't delete expired rows on its own. Call `deleteExpired()` from a scheduled job, or leave them to be overwritten by the next request with the key.

## Valkey

Valkey is the lax store, where a claim is a hash with a time to live. Use it for deduplicating notifications or non-financial creates, but not for payments, since a failover that loses writes, or a `FLUSHALL`, forgets keys, and a retry after that runs again.

Its connection needs one method, `eval(script, numKeys, ...args)`, which must reply with bytes, so a binary body comes back as it was stored. ioredis's own `eval` decodes replies as text, which the store rejects with `IdempotencyKeysReplyError` on the first replay. Send `EVAL` through `callBuffer` instead:

```ts
import { Redis } from 'ioredis'; // or Cluster, or iovalkey
import { IdempotencyKeys, ValkeyStore } from 'idempotency-keys';

const valkey = new Redis('redis://valkey:6379');
const keys = new IdempotencyKeys({
    store: new ValkeyStore({
        connection: { eval: async (...args) => valkey.callBuffer('EVAL', ...args) },
        prefix: 'idempotency_keys',
    }),
});
```

Each record is a hash at `<prefix>:<identity>`, expiring with the key (`ttlMs`). Every operation is one script on that one key, so a record lives on one node of a cluster, and the store works on Valkey Cluster or Redis Cluster. Every time is the server's `TIME`.

## Choosing

Use Postgres when the write behind the request must not happen twice: payments, orders, anything a customer would notice twice. It is also the simpler choice when the handlers already use Postgres, since the keys sit in the same database and its backups.

Use Valkey when a repeat after a failover is an annoyance rather than a harm, such as a duplicate notification, or when the service has Valkey and no Postgres.

Either store works with either [notifier](/packages/idempotency-keys/guides/notifiers), so a Postgres store with a Valkey notifier is fine.

## Your own store

`store` takes anything implementing `IdempotencyStore`, which is `claim`, `complete` and `release`, each atomic, as the [specification](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md#stores) describes. Only the built-in stores are held to the test vectors, and only a store that writes what the specification says shares keys with the Go implementation.
