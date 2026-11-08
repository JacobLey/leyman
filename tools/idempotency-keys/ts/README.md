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

Guides and the full reference are on the [docs site](https://jacobley.github.io/leyman/packages/idempotency-keys/).

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

As middleware, after authentication and a body-size limit (`handle()` reads the whole body to fingerprint it), before the route's handler:

```ts
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

const app = new Hono<{ Variables: { userId: string } }>();

app.post(
    '/notes',
    requireUser,
    bodyLimit({ maxSize: 64 * 1024 }),
    async (c, next) => {
        // Assigned, not returned: once the handler has set `c.res`, Hono ignores a middleware's return value
        // (https://github.com/honojs/hono/blob/v4.13.14/src/compose.ts#L67) and would send the handler's response,
        // whose body `handle()` already read to store it
        c.res = await keys.handle(c.req.raw, { scope: c.get('userId'), operation: 'createNote' }, async () => {
            await next();
            return c.res;
        });
    },
    async c => c.json(await createNote(await c.req.json()), 201)
);
```

### Without fetch

`begin()` is the same flow for any framework. Hash the request with `computeFingerprint()`, then run, replay, or answer as it says:

```ts
import { computeFingerprint, parseIdempotencyKey } from 'idempotency-keys';

const key = parseIdempotencyKey(headerValues); // throws IdempotencyKeyHeaderError: a 400
if (key === null) {
    return createNote(); // no key: runs as it would without the library
}
const fingerprint = await computeFingerprint({ method, target: pathAndQuery, headers, named: [], body });
const result = await keys.begin({ scope, operation: 'createNote', key, fingerprint });

switch (result.outcome) {
    case 'run': {
        const response = await createNote();
        await result.attempt.respond(response); // stored, released by the policy, lost, or refused
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

| Option               | Type                                    | Default                | Description                                                                                                                                                                                                                                                           |
| -------------------- | --------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store`              | `IdempotencyStore`                      | —                      | Required. A `PostgresStore` or `ValkeyStore`.                                                                                                                                                                                                                         |
| `notifier`           | `IdempotencyNotifier`                   | none                   | Wakes waiting requests, on this server and others, when a key's request ends. Without one, they only poll.                                                                                                                                                            |
| `ttlMs`              | `number`                                | `86_400_000` (24 h)    | How long a key lasts from when it was claimed.                                                                                                                                                                                                                        |
| `leaseMs`            | `number`                                | `60_000`               | How long a request may run before another may take over. Longer than your slowest handler, so a slow request never runs twice. Below `ttlMs`.                                                                                                                         |
| `waitMs`             | `number`                                | `10_000`               | How long a duplicate waits on a running request before a `409`. `0` answers at once.                                                                                                                                                                                  |
| `respondPolicy`      | `(response) => 'complete' \| 'release'` | `defaultRespondPolicy` | Which responses are stored (`complete`) and which free the key (`release`). The default releases only a `429`.                                                                                                                                                        |
| `fingerprintHeaders` | `readonly string[]`                     | `[]`                   | Headers that must match on a reused key in `handle()`, in any case.                                                                                                                                                                                                   |
| `problem`            | `(kind, request) => Response`           | `problemResponse`      | `handle()`'s answer to `'missing-key'`, `'invalid-key'`, `'conflict'` or `'mismatch'`.                                                                                                                                                                                |
| `onError`            | `(error, identity) => void`             | ignored                | Called with a failure that doesn't fail the request: announcing an ended request failed (other servers notice by polling), or in `handle()` the store failed to store or release a response (the caller still gets it, and the key is held until its lease runs out). |

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

**Returns** `Promise<Response>`: `run`'s response, a replay (with `Idempotent-Replayed: true`), or a problem. **Rejects** when the store fails before `run`, so a request never runs unprotected, or with `run`'s error (the key stays held until its lease runs out). Once `run` has a response, `handle()` returns it even if the store then fails to store or release it, and reports that failure to `onError`.

The request's body must be unread: `handle()` **rejects** with `IdempotencyKeysBodyUsedError` otherwise, since it couldn't fingerprint it. It reads the whole body, so put a body-size limit before it. It reads each response whole to store it, so a streamed response is buffered before it is sent.

The fingerprint's target is the URL's path and query (`/notes?draft=1`, or `/notes` when the query is empty), without the origin or fragment. A named header's value must be Latin-1 (every character at most `U+00FF`), as HTTP allows: `handle()` and `computeFingerprint()` throw `IdempotencyKeysHeaderValueError` otherwise.

#### `.begin(params)`

Claims a key. A completed request's response is replayed, and a running one is waited on (up to `waitMs`). A key on a different request is a mismatch at once, without waiting.

| Parameter     | Type     | Description                                      |
| ------------- | -------- | ------------------------------------------------ |
| `scope`       | `string` | Required, not empty.                             |
| `operation`   | `string` | Not empty.                                       |
| `key`         | `string` | The key, from `parseIdempotencyKey()`.           |
| `fingerprint` | `string` | The request's hash, from `computeFingerprint()`. |

**Returns** `Promise<BeginResult>`, one of:

- `{ outcome: 'run', attempt }`: the request holds the key. End it with `attempt.respond(response)`, which resolves to `'stored'`, `'released'` (by the policy), `'lost'` (its lease ran out and another request took over, so nothing changed), or `'refused'` (the response can't be sent: a status that isn't a whole number from 200 to 599, or a body on a `204`, `205` or `304`; the store isn't touched and the attempt still holds the key, so respond again or release it), or with `attempt.release()`, which resolves to whether it released.
- `{ outcome: 'replay', response }`: the stored `{ status, headers, body }`, `headers` as `[name, value]` pairs with repeated names kept, and `body` as bytes.

A stored response keeps its headers except `Connection`, `Content-Length`, `Keep-Alive`, `Transfer-Encoding` and `Idempotent-Replayed`, which describe one transfer rather than the response; a replay adds `Idempotent-Replayed: true` once.
- `{ outcome: 'conflict' }`: still running after `waitMs`.
- `{ outcome: 'mismatch' }`: the key was used on a different request.

### `PostgresStore`

#### `new PostgresStore({ client, table? })`

| Option   | Type                | Default              | Description                                                                                          |
| -------- | ------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `client` | `PostgresQueryable` | —                    | Required. Anything with `query(text, values)` returning `{ rows, rowCount }`, as a `pg` `Pool` does. |
| `table`  | `string`            | `'idempotency_keys'` | The table, quoted as given.                                                                          |

The table name is quoted as given, so it is case-exact, can't name a schema (it is found through `search_path`), and is at most 63 bytes (Postgres's limit, past which it would silently truncate); the channel of `PostgresNotifier` follows the same rules.

A claim is one `INSERT ... ON CONFLICT` statement, so it is exclusive and durable. Every time is Postgres's `clock_timestamp()` (not `now()`, which is fixed for a transaction), so servers with drifting clocks agree on every lease, and a response that comes after its key expired isn't stored.

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

`eval` must reply with bytes, so a binary body comes back as it was stored. ioredis's own `eval` decodes replies as text, which the store rejects with `IdempotencyKeysReplyError` on the first replay; send `EVAL` through `callBuffer`:

```ts
import { Redis } from 'ioredis'; // or Cluster, or iovalkey
import { ValkeyStore } from 'idempotency-keys';

const valkey = new Redis('redis://valkey:6379');
const store = new ValkeyStore({
    connection: { eval: async (...args) => valkey.callBuffer('EVAL', ...args) },
});
```

Every time is the server's `TIME`.

### `PostgresNotifier`

#### `PostgresNotifier.listen({ publisher, listener, channel? })`

Announces with `SELECT pg_notify(channel, identity)` on `publisher` (such as the store's pool), and hears with `LISTEN` on `listener`, a connection of its own (a `pg` `Client`, not a pool). One listening connection serves every waiting request of the process. `channel` defaults to `idempotency_keys`. `pg` doesn't reconnect a client that fails: the notifier reports its `error` event to the optional `onError(error)`, and waiting requests then only poll. To listen again, connect a new client and call `listen` again (then `close()` the old notifier).

**Returns** `Promise<PostgresNotifier>`, once listening. `.close()` stops listening (after the connection failed, it only stops dispatching); it never closes either connection.

### `ValkeyNotifier`

#### `ValkeyNotifier.listen({ publisher, subscriber, channel? })`

Announces with `PUBLISH channel identity` on `publisher`, and subscribes on `subscriber`, a connection of its own (subscribing takes it over). An ioredis `Redis` fits both, and subscribes again by itself after reconnecting; wait for it to be ready (`lazyConnect` and `await subscriber.connect()`) before listening. `channel` defaults to `idempotency_keys`.

**Returns** `Promise<ValkeyNotifier>`, once subscribed. `.close()` unsubscribes; it never closes either connection.

Either notifier works with either store. A notifier only makes waiting faster: a waiting request polls the store regardless, so one that is down or loses a message only makes waiters slower.

### Hashes and keys

- `parseIdempotencyKey(values)`: reads the key from the header's values (one per header, or already joined by `, `). A value in quotes is a Structured Field String; any other is the key as it is, and can't hold a comma, so a repeated header is always rejected. **Returns** the key, or `null` without a header. **Throws** `IdempotencyKeyHeaderError` for a repeated header, or a key that isn't 1 to 255 characters of `0x20` to `0x7E`.
- `computeIdentity({ scope, operation?, key })` and `computeFingerprint({ method, target, headers, named, body })`: the spec's SHA-256 hashes, as 64 hex characters. `headers` takes `[name, value]` pairs or a `Headers`. The method is hashed as received, except that `DELETE`, `GET`, `HEAD`, `OPTIONS`, `POST` and `PUT` are upper-cased, as `fetch` does.
- `defaultRespondPolicy` and `problemResponse(kind)`: the defaults of `respondPolicy` and `problem`, to build on.

### Errors

Every error extends `IdempotencyKeysError`.

| Error                             | When                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IdempotencyKeysOptionError`      | An option out of range; an empty or not well-formed (lone surrogate) scope, operation or key; or an empty or over 63-byte table or channel. Has `option` and `value`. |
| `IdempotencyKeyHeaderError`       | `parseIdempotencyKey()` can't read the header. Has `values`.                                                                                                          |
| `IdempotencyKeysHeaderValueError` | A named header's value isn't Latin-1. Has `header` and `value`.                                                                                                       |
| `IdempotencyKeysBodyUsedError`    | `handle()` got a request whose body was already read.                                                                                                                 |
| `IdempotencyKeysReplyError`       | A `ValkeyStore` connection replied with text where bytes were expected (ioredis's own `eval`).                                                                        |

## Limits

- **Responses are read whole** to be stored, so `handle()` buffers a streamed response before sending it.
- **Headers are stored in the order the response lists them.** For `handle()` that is the order of `fetch`'s `Headers`: sorted by name, repeated values joined, and repeated `Set-Cookie` kept.
- **A proxied response must match its body.** A response from an upstream `fetch` carries the upstream's `Content-Encoding` with a body `fetch` already decoded; strip that header in `run`, or a replay sends a decoded body labelled as encoded. `handle()` doesn't strip it for you, since a handler may really send an encoded body.
- **No lease renewal.** Set `leaseMs` above your slowest handler: a request that runs longer can be taken over, and run twice.
