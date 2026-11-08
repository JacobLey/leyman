<div style="text-align:center">

# idempotency-keys

Idempotency-Key handling for HTTP writes on Postgres or Valkey: a retried request runs once across every instance, waits on a running duplicate, and replays the first response.

[![npm package](https://badge.fury.io/js/idempotency-keys.svg)](https://www.npmjs.com/package/idempotency-keys)
[![License](https://img.shields.io/npm/l/idempotency-keys.svg)](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/ts/LICENSE)

</div>

- **One run per key, across every instance**: a duplicate of a running request waits for its response (or gets a `409`), and a later one gets the stored response back, marked `Idempotent-Replayed: true`.
- **A reused key on a different request is a `422`**, never a replay of another request's response: the method, path, query, body and the headers you name must match.
- **A crashed request holds up no one for long**: its claim is a lease, and once it runs out a waiting request takes over. A response that comes after that isn't stored.
- **Postgres or Valkey, with no client dependency**: pass your own `pg` pool or ioredis connection. Postgres is strict and durable; Valkey is lax (a failover can forget a key). Notifications through either, or none, only make waiting faster.
- **One spec across languages**: hashes, rows and notifications follow the [idempotency-keys specification](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md), so servers in other languages that implement it share the same keys.

It doesn't fit a write that must never run twice whatever happens to the store: on Valkey, a failover that loses writes or a flush forgets keys. Use the Postgres store for payments.

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
  - [Hono](#hono)
  - [Without fetch](#without-fetch)
  - [Which responses are stored](#which-responses-are-stored)
- [API](#api)
  - [IdempotencyKeys](#idempotencykeys)
  - [PostgresStore](#postgresstore)
  - [ValkeyStore](#valkeystore)
  - [PostgresNotifier](#postgresnotifier)
  - [ValkeyNotifier](#valkeynotifier)
  - [Hashes and keys](#hashes-and-keys)
  - [Errors](#errors)
- [Limits](#limits)

## Install

```sh
npm i idempotency-keys
```

ESM only. It has no dependencies: bring your own Postgres or Valkey client. The core needs only `fetch`'s `Request` and `Response` and WebCrypto; the Valkey store also imports `node:buffer`, which Bun, Deno and Workers (`nodejs_compat`) provide.

## Example

```ts
import pg from 'pg';
import { createTableSql, IdempotencyKeys, PostgresNotifier, PostgresStore } from 'idempotency-keys';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
// Once, in a migration
await pool.query(createTableSql());

const listener = new pg.Client({ connectionString: process.env.DATABASE_URL });
await listener.connect();

const keys = new IdempotencyKeys({
    store: new PostgresStore({ client: pool }),
    notifier: await PostgresNotifier.listen({ publisher: pool, listener }),
});

// In any handler over fetch's Request and Response (Hono, Bun, Deno, Next.js route handlers...)
export const POST = async (request: Request): Promise<Response> =>
    keys.handle(request, { scope: await userId(request), operation: 'createNote' }, async req => createNote(req));
```

A request without an `Idempotency-Key` header runs as usual (pass `required: true` to answer it with a `400` instead). The first request with a key runs, and its response is stored. A retry gets the same status, headers and body back. A retry while the first still runs waits up to `waitMs` for it.

## Usage

Each key has an identity: the `scope` (who is calling, such as a user or tenant id), the optional `operation` (any name you pick, such as an OpenAPI `operationId`), and the key. One caller's keys never touch another's. With an `operation`, the same key on another operation is another key; without one, reusing a key on another endpoint is a `422`.

`handle()` answers itself with an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem document (`application/problem+json`), with the status codes of the [IETF draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07):

| Status | When                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------- |
| `400`  | The `Idempotency-Key` header can't be read, or the operation requires one and the request has none. |
| `409`  | A request with the key is still running, and waiting `waitMs` for it ran out.                       |
| `422`  | The key was used on a different request (another method, path, query, body or named header).        |

Pass `problem` to answer differently.

A Postgres store never deletes expired rows on its own. Call `deleteExpired()` from a scheduled job, or leave them to be overwritten by the next request with the key.

### Hono

`handle()` takes the request Hono wraps, and returns the response to send:

```ts
import { Hono } from 'hono';

const app = new Hono<{ Variables: { userId: string } }>();

app.post('/notes', requireUser, async (c, next) =>
    keys.handle(c.req.raw, { scope: c.get('userId'), operation: 'createNote' }, async () => {
        await next();
        return c.res;
    })
);
```

### Without fetch

`begin()` is the same flow for any framework. Hash the request with `computeFingerprint()`, then run, replay, or answer as it says:

```ts
import { computeFingerprint, parseIdempotencyKey } from 'idempotency-keys';

const key = parseIdempotencyKey(headerValues); // throws IdempotencyKeyHeaderError: a 400
const fingerprint = await computeFingerprint({ method, target: pathAndQuery, headers, named: [], body });
const result = await keys.begin({ scope, operation: 'createNote', key, fingerprint });

switch (result.outcome) {
    case 'run': {
        const response = await createNote();
        await result.attempt.respond(response); // stored, or released by the policy
        return response;
    }
    case 'replay':
        return result.response;
    case 'conflict':
        return conflict409();
    case 'mismatch':
        return unprocessable422();
}
```

An attempt that never ends (its server crashed, or the handler threw) holds the key until its lease runs out, then the next request with the key runs.

### Which responses are stored

By default every response is stored except a `429` (Too Many Requests), which says nothing was done. That includes a `5xx`: a handler that failed halfway may have written something, and running it again could write it twice. If your handlers are transactional, release `5xx` responses too, so a retry runs again:

```ts
const keys = new IdempotencyKeys({
    store,
    respondPolicy: ({ status }) => (status === 429 || status >= 500 ? 'release' : 'complete'),
});
```

## API

### `IdempotencyKeys`

#### `new IdempotencyKeys(options)`

| Option               | Type                                    | Default                | Description                                                                                                                                   |
| -------------------- | --------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `store`              | `IdempotencyStore`                      | —                      | Required. A `PostgresStore` or `ValkeyStore`.                                                                                                 |
| `notifier`           | `IdempotencyNotifier`                   | none                   | Wakes waiting requests, on this server and others, when a key's request ends. Without one, they only poll.                                    |
| `ttlMs`              | `number`                                | `86_400_000` (24 h)    | How long a key lasts from when it was claimed.                                                                                                |
| `leaseMs`            | `number`                                | `60_000`               | How long a request may run before another may take over. Longer than your slowest handler, so a slow request never runs twice. Below `ttlMs`. |
| `waitMs`             | `number`                                | `10_000`               | How long a duplicate waits on a running request before a `409`. `0` answers at once.                                                          |
| `respondPolicy`      | `(response) => 'complete' \| 'release'` | `defaultRespondPolicy` | Which responses are stored (`complete`) and which free the key (`release`). The default releases only a `429`.                                |
| `fingerprintHeaders` | `readonly string[]`                     | `[]`                   | Headers that must match on a reused key in `handle()`, in any case.                                                                           |
| `problem`            | `(kind, request) => Response`           | `problemResponse`      | `handle()`'s answer to `'missing-key'`, `'invalid-key'`, `'conflict'` or `'mismatch'`.                                                        |
| `onNotifyError`      | `(error, identity) => void`             | ignored                | Called when announcing an ended request fails. The request still ends as it did, and other servers notice by polling.                         |

Durations are whole milliseconds. **Throws** `IdempotencyKeysOptionError` for a duration below 1 (`waitMs` below 0) or not whole, or a `leaseMs` not below `ttlMs`.

#### `.handle(request, options, run)`

Reads the request's `Idempotency-Key`, runs `run(request)` at most once per key, and stores its response by the policy. The fingerprint is the method, the path and query of `request.url`, the `fingerprintHeaders` and the body, read from a clone, so `run` gets the request unread.

| Parameter           | Type                                      | Description                                                     |
| ------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| `request`           | `Request`                                 | The request.                                                    |
| `options.scope`     | `string`                                  | Required, not empty. Who is calling.                            |
| `options.operation` | `string`                                  | Not empty. Which operation the request is for.                  |
| `options.required`  | `boolean`                                 | Whether a request without a key is a `400`. `false` by default. |
| `run`               | `(request: Request) => Promise<Response>` | Runs the request.                                               |

**Returns** `Promise<Response>`: `run`'s response, a replay (with `Idempotent-Replayed: true`), or a problem. **Rejects** when the store fails, so a request never runs unprotected, or with `run`'s error (the key stays held until its lease runs out).

#### `.begin(params)`

Claims a key. A completed request's response is replayed, and a running one is waited on (up to `waitMs`). A key on a different request is a mismatch at once, without waiting.

| Parameter     | Type     | Description                                      |
| ------------- | -------- | ------------------------------------------------ |
| `scope`       | `string` | Required, not empty.                             |
| `operation`   | `string` | Not empty.                                       |
| `key`         | `string` | The key, from `parseIdempotencyKey()`.           |
| `fingerprint` | `string` | The request's hash, from `computeFingerprint()`. |

**Returns** `Promise<BeginResult>`, one of:

- `{ outcome: 'run', attempt }`: the request holds the key. End it with `attempt.respond(response)`, which resolves to `'stored'`, `'released'` (by the policy), or `'lost'` (its lease ran out and another request took over, so nothing changed), or with `attempt.release()`, which resolves to whether it released.
- `{ outcome: 'replay', response }`: the stored `{ status, headers, body }`, `headers` as `[name, value]` pairs with repeated names kept, and `body` as bytes.
- `{ outcome: 'conflict' }`: still running after `waitMs`.
- `{ outcome: 'mismatch' }`: the key was used on a different request.

### `PostgresStore`

#### `new PostgresStore({ client, table? })`

| Option   | Type                | Default              | Description                                                                                          |
| -------- | ------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `client` | `PostgresQueryable` | —                    | Required. Anything with `query(text, values)` returning `{ rows, rowCount }`, as a `pg` `Pool` does. |
| `table`  | `string`            | `'idempotency_keys'` | The table, quoted as given.                                                                          |

A claim is one `INSERT ... ON CONFLICT` statement, so it is exclusive and durable. Every time is Postgres's `now()`, so servers with drifting clocks agree on every lease.

#### `.deleteExpired()`

Deletes every expired row. **Returns** `Promise<number>`, how many.

#### `createTableSql(table?)`

The `CREATE TABLE` statement of the spec, for a migration. **Returns** `string`.

### `ValkeyStore`

#### `new ValkeyStore({ connection, prefix? })`

| Option       | Type               | Default              | Description                                                         |
| ------------ | ------------------ | -------------------- | ------------------------------------------------------------------- |
| `connection` | `ValkeyConnection` | —                    | Required. Anything with `eval(script, numKeys, ...args)`.           |
| `prefix`     | `string`           | `'idempotency_keys'` | Each key is a hash at `<prefix>:<identity>`, expiring with the key. |

An ioredis `Redis` or `Cluster` fits as is, but its `eval` decodes replies as UTF-8, which changes a binary body. To replay bodies byte for byte, send `EVAL` through `callBuffer`:

```ts
import { Redis } from 'ioredis';
import { ValkeyStore } from 'idempotency-keys';

const valkey = new Redis('redis://valkey:6379');
const store = new ValkeyStore({
    connection: { eval: async (...args) => valkey.callBuffer('EVAL', ...args) },
});
```

Every time is the server's `TIME`.

### `PostgresNotifier`

#### `PostgresNotifier.listen({ publisher, listener, channel? })`

Announces with `SELECT pg_notify(channel, identity)` on `publisher` (such as the store's pool), and hears with `LISTEN` on `listener`, a connection of its own (a `pg` `Client`, not a pool). One listening connection serves every waiting request of the process. `channel` defaults to `idempotency_keys`. `pg` doesn't reconnect a client that fails: waiting requests then only poll.

**Returns** `Promise<PostgresNotifier>`, once listening. `.close()` stops listening; it never closes either connection.

### `ValkeyNotifier`

#### `ValkeyNotifier.listen({ publisher, subscriber, channel? })`

Announces with `PUBLISH channel identity` on `publisher`, and subscribes on `subscriber`, a connection of its own (subscribing takes it over). An ioredis `Redis` fits both, and subscribes again by itself after reconnecting; wait for it to be ready (`lazyConnect` and `await subscriber.connect()`) before listening. `channel` defaults to `idempotency_keys`.

**Returns** `Promise<ValkeyNotifier>`, once subscribed. `.close()` unsubscribes; it never closes either connection.

Either notifier works with either store. A notifier only makes waiting faster: a waiting request polls the store regardless, so one that is down or loses a message only makes waiters slower.

### Hashes and keys

- `parseIdempotencyKey(values)`: reads the key from the header's values, one per header. A value in quotes is a Structured Field String; any other is the key as it is. **Returns** the key, or `null` without a header. **Throws** `IdempotencyKeyHeaderError` for more than one header, or a key that isn't 1 to 255 characters of `0x20` to `0x7E`.
- `computeIdentity({ scope, operation?, key })` and `computeFingerprint({ method, target, headers, named, body })`: the spec's SHA-256 hashes, as 64 hex characters. `headers` takes `[name, value]` pairs or a `Headers`.
- `defaultRespondPolicy` and `problemResponse(kind)`: the defaults of `respondPolicy` and `problem`, to build on.

### Errors

Every error extends `IdempotencyKeysError`.

| Error                        | When                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `IdempotencyKeysOptionError` | An option out of range, or an empty scope, operation, table or channel. Has `option` and `value`. |
| `IdempotencyKeyHeaderError`  | `parseIdempotencyKey()` can't read the header. Has `values`.                                      |

## Limits

- **Responses are read whole** to be stored, so `handle()` buffers a streamed response before sending it.
- **`fetch`'s `Headers` sorts and joins headers.** A replay from `handle()` keeps the headers in the order `Headers` gave them (sorted by name, with repeated `Set-Cookie` kept). It also joins two `Idempotency-Key` headers into one value with `, `, which `handle()` reads as one key rather than a `400`; `parseIdempotencyKey()` given each value rejects them.
- **No lease renewal.** Set `leaseMs` above your slowest handler: a request that runs longer can be taken over, and run twice.
