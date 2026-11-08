# demo-openapi-server

The OpenAPI demo's notes API: Hono on Postgres with Drizzle, validating every request and response against openapi.json, with bearer authentication (static tokens or JWTs) and scopes.

Part of the [OpenAPI demo](../README.md). A worked example, never published.

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

1. **Authenticate**, with the scope the operation's `security` names: no token or an invalid one is a `401`, a valid one without the scope a `403` (`WWW-Authenticate: Bearer error="insufficient_scope", scope="notes:write"`), as RFC 6750 says. This comes first, so a caller without a token learns nothing about what the operation accepts.
2. **Limit the body**, if the operation has one: a body over 128 KiB (more than any valid note could take as JSON) is a `413`, refused from its `Content-Length`, or once that much of a chunked body has arrived, rather than read whole and then rejected.
3. **Hold the `Idempotency-Key`**, if the operation takes one and the request has one: a retry gets the first response again, without going further (see [Retrying safely](#retrying-safely)).
4. **Validate the request**: path and query parameters (strings, coerced to the schema's types, with its defaults filled in: `limit` is 20 unless given), then the JSON body (`application/json`, in any case). Anything that doesn't match, including unknown query parameters and properties, is a `400` saying why.
5. **Call the handler**, typed by genever's `Operations`: it gets only input that matched, and must answer with a documented `{ status, body }`.
6. **Validate the response**. A handler that answers with an undocumented status, or a body that breaks the schema, never reaches the client: it gets a `500`, and `onError` gets a `NotesResponseError`.

A path the spec doesn't have is a `404`, a method it doesn't have on a path it does is a `405` with `Allow`, and a handler that throws is a `500`, reported to `onError`. `onError` gets the error as thrown: Drizzle's include the query's parameters, so scrub them before they reach a log service.

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

Every answer of its own is an `ApiError`, through idempotency-keys' `problem` option, and the spec documents the `409` and `422`, so the client types them and response validation knows them. A request without a key runs as before.

- **Each key is the caller's, for the operation**: the scope is the token's subject and the operation the spec's `operationId`, so one user's key never touches another's.
- **The spec says which operations take a key.** An operation with an `Idempotency-Key` header parameter gets the middleware, and the parameter's `required` says whether a request without one is a `400`. `createNote` is the only write, and retrying it is what adds a note twice; the reads are safe to repeat. A `PUT` or `DELETE` would be idempotent by its meaning (sending it twice leaves the same state), so wouldn't need a key; a `PATCH` applying a change relative to the current state, or another `POST`, would.
- **The key is optional**: a client that never retries needs none, and existing clients keep working.
- **Where it runs**: after authentication, so a key belongs to a known caller and a `401` never holds one, and after the body limit, since the key's fingerprint reads the whole body: a body over the limit is a `413` before any of it is read. Before validation, so a `400` is kept and replayed too, which is what the same request would get anyway.
- **The body is still read by validation**: `handle()` reads a clone of the request to hash it, so Hono's `c.req` reads the original. The response it returns is assigned to `c.res` rather than returned: once a handler has set `c.res`, Hono ignores what a middleware returns ([compose.ts](https://github.com/honojs/hono/blob/v4.13.14/src/compose.ts#L67)), and would send the response whose body `handle()` read to keep it.
- **Every response is kept but a `429`**, the library's default, including a `500`: a write that failed halfway must not run twice. A retry then gets the `500` again, and a new key runs again. `createNote` is one `INSERT`, so releasing `5xx` (`respondPolicy`) would be safe too, but the default holds for any handler.
- **Keys are in Postgres**, in the [database package](../database)'s `idempotency_keys` table, through the same pool as the handlers (`db.$client`): a claim is one statement, exclusive and durable across every instance.
- **No notifier**: a duplicate waiting on a running request polls the table. Postgres `LISTEN` needs a connection of its own, connected before the app serves and closed after, and the server owns no connections (it's given a pool it never closes, and has no start or stop). A deployment that wants waiting requests woken at once binds `idempotencyKeysId` to keys with a `PostgresNotifier` on a client it owns:

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

- **Expired keys stay until overwritten**: Postgres doesn't expire rows, and an expired one is overwritten by the next request with its key. A real deployment runs `new PostgresStore({ client: pool }).deleteExpired()` from a scheduled job (a cron job, or a worker on a timer), so the table doesn't grow without end. The demo doesn't: a server that deletes on a timer of its own would need the start and stop it doesn't have.

## Validation from the document

The validators are compiled once, with Ajv (JSON Schema 2020-12, as OpenAPI 3.1 uses) and `ajv-formats` (`uuid`, `date-time`), straight from `openapi.json`:

- **The whole document is added to Ajv**, so `$ref`s between components resolve exactly as in the document. `components` isn't a JSON Schema keyword, so it's registered as one, which keeps Ajv's strict mode on for everything else.
- **Parameters and bodies use separate Ajv instances.** Parameters arrive as strings, so theirs coerces types and fills in defaults. Bodies and responses are JSON already: theirs never coerces, so `"5"` is not a number.
- **Each location's parameters become one object schema** with `additionalProperties: false`, so they validate together.

## Authentication

An `Authenticator` gets the token and the operation's scopes, and answers with the `Caller` (`{ subject }`, who the token is for), `invalid` (a `401`) or `insufficient_scope` (a `403`). Each handler gets the caller, and sees only the caller's notes: another user's note is a `404`, as if it didn't exist, so an id says nothing about whose it is. Two are built in:

- **`jwtAuthenticator({ issuer, audience })`** accepts JWT access tokens (RFC 9068) from an authorization server: signed with one of its keys (found by OpenID Connect discovery, then cached by `jose`), issued by it, for this API (`aud`, so a token meant for another service from the same issuer is refused), not expired, and with every scope needed, as its subject (`sub`, which RFC 9068 requires). The subject is a user: a service's own token (client credentials), whose `sub` is its `client_id`, is refused, or the service would act as a user named after itself. Only a token that's wrong is `invalid`: an issuer that can't be reached (its discovery document, or its keys answering an error) is a `500` reported to `onError`, since the token may well be fine. Discovery is retried on the next request. The [dev OAuth server](../../../tools/oauth-dev-server) issues such tokens in the tests.
- **`staticTokens([{ token, subject }])`** accepts a fixed list (e.g. API keys from a secret store), each for its subject, with every scope. Each token is hashed (SHA-256) and compared with `timingSafeEqual` against every allowed token, so neither the time a comparison takes nor where a match is found says anything about a guess.

With `protectedResource`, the API also serves its Protected Resource Metadata (RFC 9728) at `/.well-known/oauth-protected-resource`, listing its authorization server and scopes, and every challenge points to it (`resource_metadata="..."`). `resource` is where the API is served: with a path (the API mounted under it by a proxy), the metadata is served under that path too, as RFC 9728 places it. A client then needs only the API's URL to log in: the [notes CLI](../../agents/cli) does just that.

## The database

- **The schema is in [`database`](../database)**: the Drizzle tables, their migrations, and `schema.sql`, what the migrations build. The server queries the `notes` table it exports.
- **Handlers trust their input.** Validation already happened, so `listNotes` uses the `limit` it's given, with the spec's default filled in. `q` is matched with `ILIKE`, its `%`, `_` and `\` escaped so they match themselves. The type says so too: handlers take genever's `OperationRequest` (the mapper's `parameterDefaults` option, in `tsconfig.json`), where `limit` is always there, rather than the caller's view, where it's optional.

## Composing with haywire

`createNotesApp` covers the common case. Underneath, each part is a [haywire](../../../tools/haywire) binding, so an app (or a test) swaps one at a time:

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

Every test gets a database of its own, cloned by [`pg-dolly`](../../../tools/pg-dolly) from the database package's `schema.sql` (the template is built once per run), and the app served on a free port with `@hono/node-server`, exactly as in production. Requests go through the [typed client](../client), or plain `fetch` for requests the client can't send (bad JSON, the wrong content type). Breaking responses are tested by swapping in handlers that break the spec, one binding at a time.

Idempotency keys are tested against the same Postgres: a retry replays the same note, a key reused on another note is a `422`, a duplicate of a running request waits and replays (with a handler held open until the store says the duplicate found the key held, so nothing depends on timing) or, with `waitMs: 0`, is a `409`, two callers' keys are apart, a request without a key adds a note every time, an oversized body holds no key, and a key whose response can't be stored (its table dropped mid-request) still sends the response and reports the failure.

One test posts notes generated from the document with [`juniper-arbitrary`](../../../apps/juniper-arbitrary), and checks they come back as sent. Text is where a server and a database disagree, and hand-written cases only cover the characters someone thought of.
