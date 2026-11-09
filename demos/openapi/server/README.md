# demo-openapi-server

The notes API for the OpenAPI demo, a Hono server on Postgres with Drizzle that validates every request and response against openapi.json, and checks bearer tokens (static tokens or JWTs) and their scopes.

Part of the [OpenAPI demo](../README.md). It's a worked example, and isn't published.

## Contents

- [Example](#example)
- [How a request flows](#how-a-request-flows)
- [Retrying safely](#retrying-safely)
- [Validation from the document](#validation-from-the-document)
- [Authentication](#authentication)
- [The database](#the-database)
- [Composing with haywire](#composing-with-haywire)
- [Testing](#testing)

## Example

```ts
import { serve } from '@hono/node-server';
import { createNotesApp, jwtAuthenticator } from '@leyman/demo-openapi-server';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const app = createNotesApp({
    db: drizzle({ client: pool }),
    // Or `staticTokens([{ token: process.env.NOTES_TOKEN!, subject: 'ci' }])`, for a fixed list of API keys
    authenticate: jwtAuthenticator({ issuer: 'https://auth.example', audience: 'https://notes.example' }),
    protectedResource: { resource: 'https://notes.example', authorizationServers: ['https://auth.example'] },
    onError: error => console.error(error),
});

serve({ fetch: app.fetch, port: 3000 });
```

## How a request flows

Each operation in `openapi.json` becomes a Hono route (`/notes/{noteId}` → `/notes/:noteId`), served in this order:

1. Authenticate, with the scope the operation's `security` names. A missing or invalid token gets a `401`, and a valid one without the scope gets a `403` (`WWW-Authenticate: Bearer error="insufficient_scope", scope="notes:write"`), as RFC 6750 says. This comes first, so a caller without a token learns nothing about what the operation accepts.
2. Limit the body, if the operation has one. A body over 128 KiB (more than any valid note could take as JSON) gets a `413`. It's refused from its `Content-Length`, or once that much of a chunked body has arrived, rather than read whole and then rejected.
3. Hold the `Idempotency-Key`, if the operation takes one and the request sends one. A retry gets the first response again, without going any further (see [Retrying safely](#retrying-safely)).
4. Validate the request. Path and query parameters arrive as strings, so they're coerced to the schema's types, with its defaults filled in (`limit` is 20 unless given). Then the JSON body is checked (`application/json`, in any case). Anything that doesn't match, including unknown query parameters and properties, gets a `400` that says why.
5. Call the handler, which is typed by genever's `Operations`. It only gets input that matched, and must answer with a documented `{ status, body }`.
6. Validate the response. If a handler answers with an undocumented status, or a body that breaks the schema, the client gets a `500` instead, and `onError` gets a `NotesResponseError`.

A path the spec doesn't have gets a `404`, and a method it doesn't have on a path it does gets a `405` with `Allow`. A handler that throws gets a `500`, reported to `onError`. `onError` gets the error as it was thrown, and Drizzle's errors include the query's parameters, so scrub them before they reach a log service.

## Retrying safely

`createNote` takes an optional `Idempotency-Key` header, handled by [idempotency-keys](../../../tools/idempotency-keys/ts), so a client that timed out can send the same request again without adding the note twice:

```ts
const key = crypto.randomUUID();
// Sent again, with the same key, on every retry of this one note
const created = await client.call('createNote', {
    body: { title: 'Dolly', body: 'A sheep' },
    header: { 'Idempotency-Key': key },
});
```

| Request with the key                         | Answer                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| The first                                    | Runs, and its response is kept for 24 hours                                                |
| A retry, after the first finished            | The first's status and body (the same note, same `id`), with `Idempotent-Replayed: true`   |
| A retry, while the first still runs          | Waits for it, then the same; a `409` (`idempotency_key_in_use`) if it runs over 10 seconds |
| The same key on a different request          | `422` (`idempotency_key_reused`): another body, or anything else that differs              |
| A key that isn't 1-255 printable ASCII chars | `400` (`invalid_request`)                                                                  |

Every answer the middleware gives itself is an `ApiError`, through idempotency-keys' `problem` option. The spec documents the `409` and `422`, so the client types them and response validation accepts them. A request without a key runs as it always did.

- Each key belongs to the caller and the operation. The scope is the token's subject and the operation is the spec's `operationId`, so one user's key can't touch another's.
- The spec says which operations take a key. An operation with an `Idempotency-Key` header parameter gets the middleware, and the parameter's `required` says whether a request without one gets a `400`. `createNote` is the only write, and retrying it is what would add a note twice, while the reads are safe to repeat. A `PUT` or `DELETE` is idempotent by its meaning (sending it twice leaves the same state), so it wouldn't need a key, but a `PATCH` that applies a change relative to the current state, or another `POST`, would.
- The key is optional. A client that never retries doesn't need one, and existing clients keep working.
- The middleware runs after authentication, so a key always belongs to a known caller and a `401` doesn't hold one. It also runs after the body limit, since the key's fingerprint reads the whole body, so a body over the limit gets a `413` before any of it is read. It runs before validation, so a `400` is kept and replayed too, which is what the same request would get anyway.
- Validation can still read the body, because `handle()` hashes a clone of the request and leaves Hono's `c.req` with the original. The response `handle()` returns is assigned to `c.res` rather than returned. Once a handler has set `c.res`, Hono ignores what a middleware returns ([compose.ts](https://github.com/honojs/hono/blob/v4.13.14/src/compose.ts#L67)), and would send the response whose body `handle()` already read to keep it.
- Every response except a `429` is kept, which is the library's default. That includes a `500`, because a write that failed halfway must not run twice. A retry then gets the `500` again, and a new key runs the request again. `createNote` is a single `INSERT`, so releasing `5xx` responses (`respondPolicy`) would be safe too, but the default is right for any handler.
- Keys are stored in Postgres, in the [database package](../database)'s `idempotency_keys` table, through the same pool as the handlers (`db.$client`). Claiming a key is one statement, exclusive and durable across every instance.
- There's no notifier, so a duplicate waiting on a running request polls the table. Postgres `LISTEN` needs a connection of its own, connected before the app serves and closed afterwards, and the server doesn't own any connections (it's given a pool it never closes, and has no start or stop). A deployment that wants waiting requests woken at once binds `idempotencyKeysId` to keys with a `PostgresNotifier` on a client it owns:

  ```ts
  const listener = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await listener.connect();
  const keys = new IdempotencyKeys({
      store: new PostgresStore({ client: pool }),
      notifier: await PostgresNotifier.listen({ publisher: pool, listener }),
      problem: idempotencyProblem,
      onError: error => report(error as Error),
  });
  const app = createContainer(
      notesModule
          // ...databaseId, authenticatorId and appConfigId, as below
          .replaceBinding(bind(idempotencyKeysId).withInstance(keys))
  ).get(notesAppId);
  ```

- Expired keys stay in the table until they're overwritten. Postgres doesn't expire rows, and the next request with an expired key overwrites it. A real deployment runs `new PostgresStore({ client: pool }).deleteExpired()` from a scheduled job (a cron job, or a worker on a timer), so the table doesn't grow forever. The demo doesn't, because deleting on a timer of its own would need the start and stop the server doesn't have.

## Validation from the document

The validators are compiled once, straight from `openapi.json`, with Ajv (JSON Schema 2020-12, as OpenAPI 3.1 uses) and `ajv-formats` (`uuid`, `date-time`).

- The whole document is added to Ajv, so `$ref`s between components resolve exactly as they do in the document. `components` isn't a JSON Schema keyword, so it's registered as one, which keeps Ajv's strict mode on for everything else.
- Parameters and bodies use separate Ajv instances. Parameters arrive as strings, so their instance coerces types and fills in defaults. Bodies and responses are already JSON, so theirs doesn't coerce, and `"5"` isn't accepted as a number.
- The parameters in each location (path or query) become one object schema with `additionalProperties: false`, so they're validated together.

## Authentication

An `Authenticator` gets the token and the operation's scopes, and answers with the `Caller` (`{ subject }`, who the token is for), `invalid` (a `401`) or `insufficient_scope` (a `403`). Each handler gets the caller, and only sees the caller's notes. Another user's note is a `404`, as if it didn't exist, so an id says nothing about whose note it is. There are two built-in authenticators.

- `jwtAuthenticator({ issuer, audience })` accepts JWT access tokens (RFC 9068) from an authorization server. A token must be signed with one of the issuer's keys (found by OpenID Connect discovery, then cached by `jose`), issued by it, for this API (`aud`, so a token meant for another service from the same issuer is refused), not expired, and have every scope needed. The caller is the token's subject (`sub`, which RFC 9068 requires), and it has to be a user. A service's own token (client credentials) has its `client_id` as `sub`, and is refused, since the service would otherwise act as a user named after itself. Only a token that's wrong is `invalid`. When the issuer can't be reached (its discovery document or its keys answer with an error), the request gets a `500` reported to `onError`, since the token may well be fine, and discovery is retried on the next request. The [dev OAuth server](../../../tools/oauth-dev-server) issues these tokens in the tests.
- `staticTokens([{ token, subject }])` accepts a fixed list of tokens (API keys from a secret store, say), each for its subject and with every scope. Each token is hashed (SHA-256) and compared with `timingSafeEqual` against every allowed token, so neither how long a comparison takes nor where a match is found says anything about a guess.

With `protectedResource`, the API also serves its Protected Resource Metadata (RFC 9728) at `/.well-known/oauth-protected-resource`, listing its authorization server and scopes, and every challenge points to it (`resource_metadata="..."`). `resource` is where the API is served. If it has a path (because a proxy mounts the API under one), the metadata is served under that path too, where RFC 9728 places it. A client then only needs the API's URL to log in, which is how the [notes CLI](../../agents/cli) works.

## The database

The schema lives in the [`database`](../database) package, with the Drizzle tables, their migrations, and `schema.sql` (what the migrations build). The server queries the `notes` table it exports.

Handlers trust their input, since validation has already happened. `listNotes` uses the `limit` it's given, with the spec's default filled in. `q` is matched with `ILIKE`, with its `%`, `_` and `\` escaped so they match themselves. The types reflect this too. Handlers take genever's `OperationRequest` (the mapper's `parameterDefaults` option, in `tsconfig.json`), where `limit` is always present, rather than the caller's view, where it's optional.

## Composing with haywire

`createNotesApp` covers the common case. Underneath, each part is a [haywire](../../../tools/haywire) binding, so an app (or a test) can swap them one at a time:

| Identifier          | Bound by                                                       | Default                                                                              |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `databaseId`        | the app: Drizzle on a pool it owns, never closed by the server | —                                                                                    |
| `authenticatorId`   | the app                                                        | `jwtAuthenticatorBinding(options)` or `staticTokensBinding(tokens)`                  |
| `appConfigId`       | the app: `onError`, and `protectedResource`                    | —                                                                                    |
| `handlersId`        | `notesModule`                                                  | `drizzleHandlersBinding`                                                             |
| `idempotencyKeysId` | `notesModule`                                                  | `postgresIdempotencyKeysBinding`: Postgres, through `databaseId`'s pool, no notifier |
| `notesAppId`        | `notesModule`                                                  | the Hono app                                                                         |

```ts
const app = createContainer(
    notesModule
        .addBinding(bind(databaseId).withInstance(db))
        .addBinding(bind(authenticatorId).withInstance(introspect))
        .addBinding(bind(appConfigId).withInstance({ onError: report }))
).get(notesAppId);
```

## Testing

Every test gets its own database, cloned by [`pg-dolly`](../../../tools/pg-dolly) from the database package's `schema.sql` (the template is built once per run), and serves the app on a free port with `@hono/node-server`, exactly as in production. Requests go through the [typed client](../client), or plain `fetch` for requests the client can't send (bad JSON, the wrong content type). Responses that break the spec are tested by swapping in handlers that break it, one binding at a time.

Idempotency keys are tested against the same Postgres. A retry replays the same note, and a key reused on another note gets a `422`. A duplicate of a running request waits and replays, with the handler held open until the store reports that the duplicate found the key held, so nothing depends on timing. With `waitMs: 0` the duplicate gets a `409` instead. Two callers' keys are kept apart, a request without a key adds a note every time, and an oversized body doesn't hold a key. If a key's response can't be stored (its table is dropped mid-request), the response is still sent and the failure is reported.

One test posts notes generated from the document with [`juniper-arbitrary`](../../../apps/juniper-arbitrary), and checks they come back as sent. Text is where a server and a database tend to disagree, and hand-written cases only cover the characters someone thought of.
