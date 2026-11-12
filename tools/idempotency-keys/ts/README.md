<div style="text-align:center">

# idempotency-keys

Server-side support for the Idempotency-Key header, so clients can safely retry a POST. Works across instances on a shared store, with Postgres and Valkey built in.

[![npm package](https://badge.fury.io/js/idempotency-keys.svg)](https://www.npmjs.com/package/idempotency-keys)
[![License](https://img.shields.io/npm/l/idempotency-keys.svg)](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/ts/LICENSE)

</div>

When a client sends a `POST` and the connection drops before the response arrives, it has no way to know whether the server got the request. Retrying might create a second order, or send a second email. The fix that Stripe popularized, and that is now an [IETF draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07), is the `Idempotency-Key` header: the client generates a unique key and sends it with every attempt of the same request, and the server remembers what it answered for that key.

`idempotency-keys` is a library to handle these requests on the server, storing the keys in a store every instance shares: Postgres or Valkey, or one you write. Wrap a handler with `handle()`, and the first request with a given key runs normally and has its response saved. Retries with the same key get the saved response back instead of running the handler again. Since the keys aren't kept in memory, it works no matter which instance a retry lands on.

It also covers the cases that are easy to get wrong:

- A retry that arrives while the first request is still running waits for it to finish, rather than running alongside it.
- A key reused on a different request (a different body, say) gets a `422`, not the other request's response.
- If a server crashes mid-request, its hold on the key expires after a timeout and the next retry runs.
- A Go server can share the same keys, since both implementations follow one [specification](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md). This package implements version 1.0 of it, exported as `SPEC_VERSION`.

Use the Postgres store when a duplicate would really hurt, like a payment. Valkey works too, but a failover or a flush can lose keys, and a retry after that runs again. Any other database can hold the keys through a store of your own, written to a short [contract](#writing-a-store).

Guides and the full reference are on the [docs site](https://jacobley.github.io/leyman/packages/idempotency-keys/).

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
  - [Hono](#hono)
  - [Without fetch](#without-fetch)
  - [Which responses are stored](#which-responses-are-stored)
  - [Writing a store](#writing-a-store)
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

ESM only. It has no dependencies: bring your own Postgres or Valkey client. The protocol, `handle()` and the store interfaces come from `idempotency-keys`; the built-in adapters from `idempotency-keys/postgres` (`PostgresStore`, `PostgresNotifier`, `createTableSql`) and `idempotency-keys/valkey` (`ValkeyStore`, `ValkeyNotifier`). The core needs only `fetch`'s `Request` and `Response` and WebCrypto; the Valkey adapters also import `node:buffer`, which Bun, Deno and Workers (`nodejs_compat`) provide.

## Example

```ts
import pg from 'pg';
import { IdempotencyKeys } from 'idempotency-keys';
import { createTableSql, PostgresNotifier, PostgresStore } from 'idempotency-keys/postgres';

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

Requests without an `Idempotency-Key` header go straight to the handler. If you'd rather reject them, pass `required: true` and they get a `400`.

The notifier is optional. Without it, a retry waiting on a running request checks the store every so often; with it, the retry is woken as soon as the first request finishes, even when that happened on another instance.

## Usage

Keys are kept per caller. Pass the user or tenant id as `scope`, so that two users who happen to send the same key don't collide.

`operation` is optional. If you set it (an OpenAPI `operationId` works well), a client can reuse the same key on different endpoints and each is treated separately. If you leave it out, a key belongs to the caller as a whole, and reusing it on another endpoint gets a `422`.

When `handle()` turns a request away itself, it responds with an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem document (`application/problem+json`), using the status codes from the IETF draft:

| Status | When                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------- |
| `400`  | The `Idempotency-Key` header can't be read, or the operation requires one and the request has none. |
| `409`  | A request with the key is still running, and waiting `waitMs` for it ran out.                       |
| `422`  | The key was used on a different request (another method, path, query, body or named header).        |

To send something else, pass your own `problem` function.

Keys expire after 24 hours by default (`ttlMs`). Postgres doesn't delete expired rows by itself. They do no harm, since the next request with the same key overwrites the row, but the table keeps growing, so call `deleteExpired()` from a scheduled job.

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
        await result.attempt.respond(response); // stored, released by the policy, or lost
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

A response a replay couldn't send (a status that isn't a whole number from 200 to 599, or a body on a `204`, `205` or `304`) can't be stored at all: `respond()` rejects with `IdempotencyKeysResponseError` before asking the policy or touching the store, and the attempt still holds the key, to respond again or release. `handle()` never gets one from `fetch`'s `Response`, which can't be built that way.

### Writing a store

`store` takes anything implementing `IdempotencyStore`: `claim`, `complete` and `release`, as the [specification](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md#stores) defines them. The library does the hashing, waiting, policy and notifying, so a store only keeps records, and its [contract](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md#the-store-contract) is short:

- Each operation is atomic for its identity: of two concurrent claims on a free key, exactly one gets `claimed`.
- Reads see every completed write, from any server.
- A record past its `ttlMs` counts as absent to every operation, whether or not it was deleted yet.
- Every time is measured on one clock: the store's own, or else the servers' (then `leaseMs` must also cover the drift between them).
- A failure rejects, never answers, so a request never runs unprotected.
- A store that can lose records says so.

The [test helpers](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/ts/test/helpers/memory-store.ts) hold a short in-memory store that keeps every point, and runs the same test vectors as the built-in stores; the [docs](https://jacobley.github.io/leyman/packages/idempotency-keys/guides/writing-a-store) walk through it. Only a store with the built-in layouts shares keys with a Go server.

## API

### `IdempotencyKeys`

#### `new IdempotencyKeys(options)`

| Option               | Type                                    | Default                | Description                                                                                                                                                                                                                                                                                                      |
| -------------------- | --------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store`              | `IdempotencyStore`                      | —                      | Required. A `PostgresStore`, a `ValkeyStore`, or [your own](#writing-a-store).                                                                                                                                                                                                                                   |
| `notifier`           | `IdempotencyNotifier`                   | none                   | Wakes waiting requests, on this server and others, when a key's request ends. Without one, they only poll.                                                                                                                                                                                                       |
| `ttlMs`              | `number`                                | `86_400_000` (24 h)    | How long a key lasts from when it was claimed.                                                                                                                                                                                                                                                                   |
| `leaseMs`            | `number`                                | `60_000`               | How long a request may run before another may take over. Longer than your slowest handler, so a slow request never runs twice. Below `ttlMs`.                                                                                                                                                                    |
| `waitMs`             | `number`                                | `10_000`               | How long a duplicate waits on a running request before a `409`. `0` answers at once.                                                                                                                                                                                                                             |
| `respondPolicy`      | `(response) => 'complete' \| 'release'` | `defaultRespondPolicy` | Which responses are stored (`complete`) and which free the key (`release`). The default releases only a `429`.                                                                                                                                                                                                   |
| `fingerprintHeaders` | `readonly string[]`                     | `[]`                   | Headers that must match on a reused key in `handle()`, in any case.                                                                                                                                                                                                                                              |
| `problem`            | `(kind, request) => Response`           | `problemResponse`      | `handle()`'s answer to `'missing-key'`, `'invalid-key'`, `'conflict'` or `'mismatch'`.                                                                                                                                                                                                                           |
| `onError`            | `(error, identity) => void`             | ignored                | Called with a failure that doesn't fail the request: announcing an ended request failed (other servers notice by polling), or in `handle()` the response couldn't be stored or released, by the store or as one a replay couldn't send (the caller still gets it, and the key is held until its lease runs out). |

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

**Returns** `Promise<Response>`: `run`'s response, a replay (with `Idempotent-Replayed: true`), or a problem. **Rejects** when the store fails before `run`, so a request never runs unprotected, or with `run`'s error (the key stays held until its lease runs out). Once `run` has a response, `handle()` returns it even if it then can't be stored or released, and reports that failure to `onError`.

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

- `{ outcome: 'run', attempt }`: the request holds the key. End it with `attempt.respond(response)`, which resolves to `'stored'` or `'released'` (by the policy), or `'lost'` (its lease ran out and another request took over, so nothing changed), and rejects with `IdempotencyKeysResponseError` for a response a replay couldn't send (a status that isn't a whole number from 200 to 599, or a body on a `204`, `205` or `304`; the store isn't touched and the attempt still holds the key, so respond again or release it); or with `attempt.release()`, which resolves to whether it released.
- `{ outcome: 'replay', response }`: the stored `{ status, headers, body }`, `headers` as `[name, value]` pairs with repeated names kept, and `body` as bytes.

A stored response keeps its headers except `Connection`, `Content-Length`, `Keep-Alive`, `Transfer-Encoding` and `Idempotent-Replayed`, which describe one transfer rather than the response; a replay adds `Idempotent-Replayed: true` once.
- `{ outcome: 'conflict' }`: still running after `waitMs`.
- `{ outcome: 'mismatch' }`: the key was used on a different request.

### `PostgresStore`

From `idempotency-keys/postgres`, like `createTableSql` and `PostgresNotifier`.

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

From `idempotency-keys/valkey`, like `ValkeyNotifier`.

#### `new ValkeyStore({ connection, prefix? })`

| Option       | Type               | Default              | Description                                                         |
| ------------ | ------------------ | -------------------- | ------------------------------------------------------------------- |
| `connection` | `ValkeyConnection` | —                    | Required. Anything with `eval(script, numKeys, ...args)`.           |
| `prefix`     | `string`           | `'idempotency_keys'` | Each key is a hash at `<prefix>:<identity>`, expiring with the key. |

`eval` must reply with bytes, so a binary body comes back as it was stored. ioredis's own `eval` decodes replies as text, which the store rejects with `IdempotencyKeysReplyError` on the first replay; send `EVAL` through `callBuffer`:

```ts
import { Redis } from 'ioredis'; // or Cluster, or iovalkey
import { ValkeyStore } from 'idempotency-keys/valkey';

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
| `IdempotencyKeysReplyError`       | From `idempotency-keys/valkey`: a `ValkeyStore` connection replied with text (ioredis's own `eval`).                                                                  |
| `IdempotencyKeysResponseError`    | `attempt.respond()` got a response a replay couldn't send: a status that isn't a whole number from 200 to 599, or a body on a `204`, `205` or `304`. Has `status`.    |

## Limits

- **Responses are read whole** to be stored, so `handle()` buffers a streamed response before sending it.
- **Headers are stored in the order the response lists them.** For `handle()` that is the order of `fetch`'s `Headers`: sorted by name, repeated values joined, and repeated `Set-Cookie` kept.
- **A proxied response must match its body.** A response from an upstream `fetch` carries the upstream's `Content-Encoding` with a body `fetch` already decoded; strip that header in `run`, or a replay sends a decoded body labelled as encoded. `handle()` doesn't strip it for you, since a handler may really send an encoded body.
- **No lease renewal.** Set `leaseMs` above your slowest handler: a request that runs longer can be taken over, and run twice.
