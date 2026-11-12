---
description: IdempotencyKeys and its options, handle and begin, the store interface, the Postgres and Valkey stores and notifiers, the hashes, and every error of the TypeScript package.
---

# API

The protocol, `handle()`, the hashes, the errors and the interfaces are exported from `idempotency-keys`. The built-in adapters each have a subpath: [`idempotency-keys/postgres`](#idempotency-keys-postgres) and [`idempotency-keys/valkey`](#idempotency-keys-valkey).

## `new IdempotencyKeys(options)`

| Option               | Type                                                                     | Default                                         | Description                                                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store`              | `IdempotencyStore`                                                       | —                                               | Required. A [`PostgresStore`](#new-postgresstore-client-table), a [`ValkeyStore`](#new-valkeystore-connection-prefix), or [your own](#idempotencystore).                                                                                                                                                         |
| `notifier`           | `IdempotencyNotifier`                                                    | none                                            | Wakes waiting requests, on this server and others, when a key's request ends. Without one, they only poll. See [Notifiers](/packages/idempotency-keys/guides/notifiers).                                                                                                                                         |
| `ttlMs`              | `number`                                                                 | `86_400_000` (24 h)                             | How long a key lasts from when it was claimed. A takeover claims it again.                                                                                                                                                                                                                                       |
| `leaseMs`            | `number`                                                                 | `60_000`                                        | How long a request may run before another may take over. Longer than your slowest handler, so a slow request never runs twice. Below `ttlMs`.                                                                                                                                                                    |
| `waitMs`             | `number`                                                                 | `10_000`                                        | How long a duplicate waits on a running request before a `409`. `0` answers at once.                                                                                                                                                                                                                             |
| `respondPolicy`      | `(response: StoredResponse) => 'complete' \| 'release'`                  | [`defaultRespondPolicy`](#defaultrespondpolicy) | Which responses are stored (`complete`) and which free the key (`release`). See [Which responses are stored](/packages/idempotency-keys/guides/responses).                                                                                                                                                       |
| `fingerprintHeaders` | `readonly string[]`                                                      | `[]`                                            | Headers that must match on a reused key in `handle()`, in any case.                                                                                                                                                                                                                                              |
| `problem`            | `(kind: ProblemKind, request: Request) => Response \| Promise<Response>` | [`problemResponse`](#problemresponse-kind)      | `handle()`'s answer to `'missing-key'`, `'invalid-key'`, `'conflict'` or `'mismatch'`.                                                                                                                                                                                                                           |
| `onError`            | `(error: unknown, identity: string) => void`                             | ignored                                         | Called with a failure that doesn't fail the request: announcing an ended request failed (other servers notice by polling), or in `handle()` the response couldn't be stored or released, by the store or as one a replay couldn't send (the caller still gets it, and the key is held until its lease runs out). |

Durations are whole milliseconds. **Throws** `IdempotencyKeysOptionError` for a duration below 1 (`waitMs` below 0) or not whole, or a `leaseMs` not below `ttlMs`.

While a request waits, it claims the key again 50 ms after its first try, then twice as long each time, up to a second between tries, and at once when the notifier announces the key.

## `keys.handle(request, options, run)`

Reads the request's `Idempotency-Key`, runs `run(request)` at most once per key, and stores its response by the policy.

| Parameter           | Type                                      | Description                                                     |
| ------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| `request`           | `Request`                                 | The request. Its body must be unread.                           |
| `options.scope`     | `string`                                  | Required, not empty. Who is calling.                            |
| `options.operation` | `string`                                  | Optional, not empty. Which operation the request is for.        |
| `options.required`  | `boolean`                                 | Whether a request without a key is a `400`. `false` by default. |
| `run`               | `(request: Request) => Promise<Response>` | Runs the request, given the request unread.                     |

The fingerprint is the method, the path and query of `request.url` (`/notes?draft=1`, or `/notes` when the query is empty), the `fingerprintHeaders` and the body, read from a clone. It reads the whole body, so put a body-size limit before it, and each response whole to store it, so a streamed response is buffered before it is sent.

**Returns** `Promise<Response>`:

| Response                        | When                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `run`'s response                | The request had no key (and `required` is `false`), or it held the key. Returned even if it then can't be stored.       |
| A replay                        | A request with the key completed. Its status, headers and body, with `Idempotent-Replayed: true`.                       |
| `problem('missing-key')`, `400` | `required` is `true`, and the request has no key.                                                                       |
| `problem('invalid-key')`, `400` | The header can't be read: not 1 to 255 characters of `0x20` to `0x7E`, a malformed quoted string, or a repeated header. |
| `problem('conflict')`, `409`    | A request with the key is still running, and waiting `waitMs` for it ran out.                                           |
| `problem('mismatch')`, `422`    | The key was used on a different request.                                                                                |

**Rejects** with `IdempotencyKeysBodyUsedError` when the request's body was already read; with the store's error when it fails before `run`, so a request never runs unprotected; with `run`'s error (the key stays held until its lease runs out); with `IdempotencyKeysOptionError` for an empty or not well-formed `scope` or `operation` (checked once the request has a key); and with `IdempotencyKeysHeaderValueError` for a named header whose value isn't Latin-1.

## `keys.begin(params)`

Claims a key, for a framework without `fetch`'s `Request`. A completed request's response is replayed, and a running one is waited on (up to `waitMs`). A key on a different request is a mismatch at once, without waiting. See [Other frameworks](/packages/idempotency-keys/guides/other-frameworks).

| Parameter     | Type     | Description                                                                   |
| ------------- | -------- | ----------------------------------------------------------------------------- |
| `scope`       | `string` | Required, not empty.                                                          |
| `operation`   | `string` | Optional, not empty.                                                          |
| `key`         | `string` | The key, from [`parseIdempotencyKey()`](#parseidempotencykey-values).         |
| `fingerprint` | `string` | The request's hash, from [`computeFingerprint()`](#computefingerprint-input). |

**Returns** `Promise<BeginResult>`, one of:

| `outcome`    | With       | Means                                                                             |
| ------------ | ---------- | --------------------------------------------------------------------------------- |
| `'run'`      | `attempt`  | The request holds the key. Run it, and end the [attempt](#idempotencyattempt).    |
| `'replay'`   | `response` | A request with the key completed: the stored [`StoredResponse`](#storedresponse). |
| `'conflict'` |            | A request with the key is still running after `waitMs`: answer `409`.             |
| `'mismatch'` |            | The key was used on a different request: answer `422`.                            |

**Rejects** with `IdempotencyKeysOptionError` when `scope`, `operation` or `key` is empty or not well-formed Unicode (a lone surrogate), and with the store's error.

### `IdempotencyAttempt`

| Member              | Returns                  | Description                                                                                                                                          |
| ------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity`          | `string`                 | The key's identity, as 64 hex characters.                                                                                                            |
| `respond(response)` | `Promise<RespondResult>` | Ends the attempt by the respond policy: `'stored'`, `'released'`, or `'lost'` (its lease ran out and another request took over, so nothing changed). |
| `release()`         | `Promise<boolean>`       | Frees the key whatever the response. `false` when another request took over.                                                                         |

Both reject with the store's error. A failed announcement goes to `onError` instead. `respond()` also rejects with `IdempotencyKeysResponseError` for a response a replay couldn't send (a status that isn't a whole number from 200 to 599, or a body on a `204`, `205` or `304`), before asking the policy or touching the store, so the attempt still holds the key, to respond again or release.

### `StoredResponse`

| Field     | Type                                     | Description                                                                                                                                                                       |
| --------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`  | `number`                                 | The status code, a whole number from 200 to 599.                                                                                                                                  |
| `headers` | `readonly (readonly [string, string])[]` | `[name, value]` pairs, repeated names kept. Stored with names in lower case, without `Connection`, `Content-Length`, `Keep-Alive`, `Transfer-Encoding` and `Idempotent-Replayed`. |
| `body`    | `Uint8Array`                             | The body's bytes.                                                                                                                                                                 |

## `defaultRespondPolicy`

Completes every response except a `429`, which it releases.

## `problemResponse(kind)`

The default `problem`: an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem document (`application/problem+json`, `type: 'about:blank'`), with the status the IETF draft gives: `400` for `'missing-key'` and `'invalid-key'`, `409` for `'conflict'`, `422` for `'mismatch'`.

```ts
import type { IdempotencyStore, ProblemKind } from 'idempotency-keys';
import { IdempotencyKeys, problemResponse } from 'idempotency-keys';

declare const store: IdempotencyStore;
// ---cut---
// Your API's error shape for a conflict, the default for the rest
const keys = new IdempotencyKeys({
    store,
    problem: (kind: ProblemKind) =>
        kind === 'conflict'
            ? Response.json({ code: 'in_progress', message: 'Retry later' }, { status: 409 })
            : problemResponse(kind),
});
```

## `IdempotencyStore`

What `store` takes: the three operations of the [specification](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md#stores). A store of your own must keep its [contract](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md#the-store-contract): see [Writing a store](/packages/idempotency-keys/guides/writing-a-store).

| Member                                | Returns                | Description                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claim(params)`                       | `Promise<ClaimResult>` | Takes `ClaimParams` (`identity`, `fingerprint`, `token`, `leaseMs`, `ttlMs`). `{ state: 'claimed' }` when the record was absent, expired, or running past its lease with the same fingerprint, and is now this request's; otherwise `{ state: 'running', fingerprint }` or `{ state: 'completed', fingerprint, response }`. |
| `complete(identity, token, response)` | `Promise<boolean>`     | Stores the response if the record holds `token`, and says whether it did.                                                                                                                                                                                                                                                   |
| `release(identity, token)`            | `Promise<boolean>`     | Deletes the record if it holds `token`, and says whether it did.                                                                                                                                                                                                                                                            |

## `idempotency-keys/postgres`

`PostgresStore`, `PostgresNotifier`, `createTableSql`, and their types.

### `new PostgresStore({ client, table? })`

| Option   | Type                | Default              | Description                                                                                                                                                                                                           |
| -------- | ------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client` | `PostgresQueryable` | —                    | Required. Anything with `query(text, values)` returning `{ rows, rowCount }`, as a `pg` `Pool` or `Client` does. `bytea` must come back as bytes and `jsonb` parsed, as `pg` returns them. Never closed by the store. |
| `table`  | `string`            | `'idempotency_keys'` | The table, quoted as given: case-exact, at most 63 bytes, never schema-qualified (set the client's `search_path`).                                                                                                    |

**Throws** `IdempotencyKeysOptionError` for an empty table name, or one over 63 bytes.

#### `store.deleteExpired()`

Deletes every expired row. **Returns** `Promise<number>`, how many. Postgres never deletes them on its own: run it from a scheduled job.

### `createTableSql(table?)`

The `CREATE TABLE` statement of the specification, for a migration. `table` defaults to `'idempotency_keys'`, with the rules of `PostgresStore`'s. **Returns** `string`.

### `PostgresNotifier.listen(options)`

| Option      | Type                     | Default              | Description                                                                                                                                |
| ----------- | ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `publisher` | `PostgresQueryable`      | —                    | Required. Where to run `SELECT pg_notify(channel, identity)`, such as the store's pool.                                                    |
| `listener`  | `PostgresListener`       | —                    | Required. A connection of its own that stays open to `LISTEN`: a `pg` `Client`, not a pool.                                                |
| `onError`   | `(error: Error) => void` | ignored              | Called when the listening connection fails. `pg` doesn't reconnect it, so waiting requests then only poll: listen again with a new client. |
| `channel`   | `string`                 | `'idempotency_keys'` | The channel every server shares, quoted: case-exact, at most 63 bytes.                                                                     |

**Returns** `Promise<PostgresNotifier>`, once listening. **Rejects** with `IdempotencyKeysOptionError` for an empty channel or one over 63 bytes, and with the `LISTEN`'s error. `notifier.close()` runs `UNLISTEN` (after the connection failed, it only stops dispatching). It never closes either connection.

## `idempotency-keys/valkey`

`ValkeyStore`, `ValkeyNotifier`, and their types.

### `new ValkeyStore({ connection, prefix? })`

| Option       | Type               | Default              | Description                                                                                                                                                                              |
| ------------ | ------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection` | `ValkeyConnection` | —                    | Required. Anything with `eval(script, numKeys, ...args)` replying with bytes. With ioredis, `{ eval: async (...args) => redis.callBuffer('EVAL', ...args) }`. Never closed by the store. |
| `prefix`     | `string`           | `'idempotency_keys'` | Each key is a hash at `<prefix>:<identity>`, expiring with the key.                                                                                                                      |

A connection replying with text, such as ioredis's own `eval`, makes a replay reject with `IdempotencyKeysReplyError`.

### `ValkeyNotifier.listen(options)`

| Option       | Type               | Default              | Description                                                                                                                                                                            |
| ------------ | ------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `publisher`  | `ValkeyPublisher`  | —                    | Required. Anything with `publish(channel, message)`, such as an ioredis `Redis`.                                                                                                       |
| `subscriber` | `ValkeySubscriber` | —                    | Required. A connection of its own, as subscribing takes it over. An ioredis `Redis` fits, and subscribes again by itself after reconnecting; wait for it to be ready before listening. |
| `channel`    | `string`           | `'idempotency_keys'` | The channel every server shares.                                                                                                                                                       |

**Returns** `Promise<ValkeyNotifier>`, once subscribed. `notifier.close()` unsubscribes. It never closes either connection.

## Hashes and keys

### `parseIdempotencyKey(values)`

Reads the key from the header's values: one per header, or already joined by `, `. A value in quotes is a Structured Field String, and the key is its content; any other is the key as it is, and can't hold a comma, so a repeated header is always rejected.

**Returns** `string | null`: the key, or `null` without a header. **Throws** `IdempotencyKeyHeaderError` for a repeated header, a malformed quoted string, or a key that isn't 1 to 255 characters of `0x20` to `0x7E`.

### `computeIdentity(input)`

The identity hash: SHA-256 of `scope`, `operation` (optional) and `key`. **Returns** `Promise<string>`, 64 hex characters.

### `computeFingerprint(input)`

The fingerprint hash. **Returns** `Promise<string>`, 64 hex characters.

| Field     | Type                                  | Description                                                                                                                                      |
| --------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `method`  | `string`                              | As received. `DELETE`, `GET`, `HEAD`, `OPTIONS`, `POST` and `PUT` are upper-cased, as `fetch` does; other methods are case-sensitive.            |
| `target`  | `string`                              | The path and query, as a WHATWG URL serializes them (as `Request.url` holds them).                                                               |
| `headers` | `Iterable<readonly [string, string]>` | The request's headers as `[name, value]` pairs in the order received, or a `Headers`. Values hold one character per byte (`U+0000` to `U+00FF`). |
| `named`   | `readonly string[]`                   | The names of the headers in the fingerprint, in any case and order.                                                                              |
| `body`    | `string \| Uint8Array`                | The raw body: bytes, or a string as UTF-8. Empty for a request without one.                                                                      |

**Throws** `IdempotencyKeysHeaderValueError` for a named header whose value has a character above `U+00FF`.

## Errors

Every error extends `IdempotencyKeysError`.

| Error                             | When                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IdempotencyKeysOptionError`      | An option out of range; an empty or not well-formed (lone surrogate) scope, operation or key; or an empty or over 63-byte table or channel. Has `option` and `value`. |
| `IdempotencyKeyHeaderError`       | `parseIdempotencyKey()` can't read the header. Has `values`.                                                                                                          |
| `IdempotencyKeysHeaderValueError` | A named header's value isn't Latin-1. Has `header` and `value`.                                                                                                       |
| `IdempotencyKeysBodyUsedError`    | `handle()` got a request whose body was already read.                                                                                                                 |
| `IdempotencyKeysReplyError`       | A `ValkeyStore` connection replied with text where bytes were expected (ioredis's own `eval`).                                                                        |
| `IdempotencyKeysResponseError`    | `attempt.respond()` got a response a replay couldn't send: a status that isn't a whole number from 200 to 599, or a body on a `204`, `205` or `304`. Has `status`.    |

## Types

Also exported from `idempotency-keys`, for your own stores, notifiers and wrappers: `IdempotencyStore`, `ClaimParams`, `ClaimResult`, `StoredResponse`, `IdempotencyAttempt`, `IdempotencyNotifier` (`publish`, `subscribe`), `RespondPolicy`, `RespondResult`, `BeginParams`, `BeginResult`, `HandleOptions`, `IdempotencyKeysOptions`, `ProblemKind`, `IdentityInput` and `FingerprintInput`.

From `idempotency-keys/postgres`: `PostgresQueryable`, `PostgresStoreOptions`, `PostgresListener`, `PostgresNotification` and `PostgresNotifierOptions`. From `idempotency-keys/valkey`: `ValkeyConnection`, `ValkeyStoreOptions`, `ValkeyPublisher`, `ValkeySubscriber` and `ValkeyNotifierOptions`.
