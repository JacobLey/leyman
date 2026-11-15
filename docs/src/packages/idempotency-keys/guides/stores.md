---
description: The three stores idempotency-keys ships, Postgres and DynamoDB (strict and durable) and Valkey (lax), how to connect each, when not to use Valkey, and bringing your own.
---

# Stores

A store holds one record per key: running (claimed by one request, holding its lease) or completed (holding its response). Every server handling the same keys uses the same store, which is what lets a retry land on any instance.

idempotency-keys ships three: `PostgresStore`, from `idempotency-keys/postgres`, `DynamoDbStore`, from `idempotency-keys/dynamodb`, and `ValkeyStore`, from `idempotency-keys/valkey`. Postgres and Valkey time every lease on the database's own clock, so servers whose clocks drift still agree on every lease. DynamoDB has no clock a write can read, so it uses the servers' clocks. For anything else, [write your own](#your-own-store).

|                           | `PostgresStore`                                            | `DynamoDbStore`                                                      | `ValkeyStore`                                             |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| A claim is                | A row written by one `INSERT ... ON CONFLICT` statement    | An item written by one conditional `PutItem`                         | A hash written by one Lua script                          |
| After a crash or failover | The key is still there                                     | The key is still there                                               | A failover that loses writes, or a flush, forgets the key |
| Expired keys              | Stay until overwritten or `deleteExpired()`                | Deleted by DynamoDB's Time to Live, if turned on                     | Expire with their time to live                            |
| Clock                     | `clock_timestamp()`                                        | Each server's own (`Date.now()`)                                     | `TIME`                                                    |
| Largest response          | About 1 GB                                                 | 400 KB for the whole item                                            | 512 MB                                                    |
| Client                    | Anything with `query(text, values)`, such as a `pg` `Pool` | The `DynamoDB` client of `@aws-sdk/client-dynamodb`, or a look-alike | Anything with `eval`, replying with bytes                 |

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

## DynamoDB

DynamoDB is strict too. A claim is one `PutItem` that only writes if the key is free, its key expired, or its lease ran out on the same request, so two servers can't both claim a key, and DynamoDB keeps what it wrote. When the claim loses, DynamoDB sends back the item that stopped it, so a replay is one request, with no read after it.

```ts
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { IdempotencyKeys } from 'idempotency-keys';
import { DynamoDbStore } from 'idempotency-keys/dynamodb';

const dynamodb = new DynamoDB({ region: 'us-east-1' });
const keys = new IdempotencyKeys({
    store: new DynamoDbStore({ connection: dynamodb, table: 'idempotency_keys' }),
});
```

The connection is the aggregated `DynamoDB` client, with methods such as `putItem`, not `DynamoDBClient`, which only has `send`. The package doesn't depend on the SDK: anything with the same `putItem`, `updateItem` and `deleteItem` works, as long as a failed condition rejects with an error named `ConditionalCheckFailedException` that carries the item it found as `Item`, as the SDK's errors do. The store never destroys the client.

The table has one key, `identity`, holding bytes. [`createTableInput()`](/packages/idempotency-keys/reference/api#createtableinput-table) gives what `CreateTable` takes, billed per request, and [`updateTimeToLiveInput()`](/packages/idempotency-keys/reference/api#updatetimetoliveinput-table) turns on Time to Live for the `ttl` attribute, so DynamoDB deletes expired keys on its own, some time after they expire. Without it, an expired item stays until the next request with its key writes over it. Every write checks the expiry itself, so it never relies on when DynamoDB gets round to deleting.

```ts
import { type DynamoDB, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { createTableInput, updateTimeToLiveInput } from 'idempotency-keys/dynamodb';

declare const dynamodb: DynamoDB;
// ---cut---
await dynamodb.createTable(createTableInput());
await waitUntilTableExists({ client: dynamodb, maxWaitTime: 60 }, { TableName: 'idempotency_keys' });
await dynamodb.updateTimeToLive(updateTimeToLiveInput());
```

Two things are different from the other stores:

- **The clock is the servers'.** DynamoDB has no clock a condition can read, so each server sends its own time with every write. A server whose clock runs ahead can take over a lease early, so `leaseMs` has to cover the slowest handler plus the worst drift between your servers, and a key can expire early by as much as that drift. With servers synced by NTP, drift is milliseconds, far below the default lease of a minute.
- **An item holds at most 400 KB**, the response included. Completing with a response that doesn't fit is an error: the request still sends its response to its caller, the key stays claimed, and once its lease runs out a retry runs again. Keep large bodies elsewhere (S3, say) and store a reference, or use Postgres.

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

Use DynamoDB for the same guarantees when the service already runs on it, or runs without a database server to look after, such as on Lambda, as long as its responses stay under 400 KB.

Use Valkey when a repeat after a failover is an annoyance rather than a harm, such as a duplicate notification, or when the service has Valkey and no Postgres.

Any store works with any [notifier](/packages/idempotency-keys/guides/notifiers), so a Postgres store with a Valkey notifier is fine, and so is a DynamoDB store with either. DynamoDB has no notifier of its own.

## Your own store

`store` takes anything implementing `IdempotencyStore`: `claim`, `complete` and `release`. The library does the hashing, the waiting, the policy and the notifying, so a store only keeps records, and the [specification](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md#the-store-contract) states what it must guarantee in a few points. [Writing a store](/packages/idempotency-keys/guides/writing-a-store) goes through them with an in-memory example.

A store of your own shares keys with servers in other languages only if each of them implements the same layout. The Postgres, DynamoDB and Valkey layouts are pinned by the specification, so the built-in stores share keys with a [Go](/packages/idempotency-keys/guides/go) server out of the box.
