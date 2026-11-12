---
description: The two stores idempotency-keys ships, Postgres (strict and durable) and Valkey (lax), how to connect each, when not to use Valkey, and bringing your own.
---

# Stores

A store holds one record per key: running (claimed by one request, holding its lease) or completed (holding its response). Every server handling the same keys uses the same store, which is what lets a retry land on any instance.

idempotency-keys ships two: `PostgresStore`, from `idempotency-keys/postgres`, and `ValkeyStore`, from `idempotency-keys/valkey`. Both time every lease on the database's own clock rather than a server's, so servers whose clocks drift still agree on every lease. For anything else, [write your own](#your-own-store).

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
import { IdempotencyKeys } from 'idempotency-keys';
import { PostgresStore } from 'idempotency-keys/postgres';

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
import { IdempotencyKeys } from 'idempotency-keys';
import { ValkeyStore } from 'idempotency-keys/valkey';

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

`store` takes anything implementing `IdempotencyStore`: `claim`, `complete` and `release`. The library does the hashing, the waiting, the policy and the notifying, so a store only keeps records, and the [specification](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md#the-store-contract) states what it must guarantee in a few points. [Writing a store](/packages/idempotency-keys/guides/writing-a-store) goes through them with an in-memory example.

A store of your own shares keys with servers in other languages only if each of them implements the same layout. The Postgres and Valkey layouts are pinned by the specification, so those two stores share keys with a [Go](/packages/idempotency-keys/guides/go) server out of the box.
