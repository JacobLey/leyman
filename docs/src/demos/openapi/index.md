---
description: A small notes API built properly from the spec down to the database, with an OpenAPI 3.1 document written with Juniper, genever types for a typed client and a Hono server that validates every request and response, and Drizzle on Postgres.
---

# OpenAPI

<ProjectHeader />

The notes API is deliberately small (you can add a note, read one, and list the newest). What the demo shows is how the parts connect, from the spec down to the database, so that whole path is built properly even though the API itself is tiny.

```
spec (juniper) ──► openapi.json, notes.openapi.yaml ──┬──► client: imported types + a typed fetch client
                                                     └──► server: imported types + Hono, validating against openapi.json
                                         ▲ Drizzle tables, and schema.sql for pg-dolly per test
database: Drizzle migrations ──► schema.sql (what the migrations build, against Postgres)
```

These are worked examples, and none of them is published. Each is still a full package (lint, types, 100% coverage), and the server's tests run against a real Postgres.

| Package                                                                           | Output                                                                                                                |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`spec`](https://github.com/JacobLey/leyman/tree/main/demos/openapi/spec)         | `openapi.json` and `notes.openapi.yaml`, built from [Juniper](/packages/juniper/) schemas. See [The spec](#the-spec). |
| [`client`](https://github.com/JacobLey/leyman/tree/main/demos/openapi/client)     | A typed client, from `openapi.json`. See [The client](#the-client).                                                   |
| [`database`](https://github.com/JacobLey/leyman/tree/main/demos/openapi/database) | The Drizzle schema, its migrations, and `schema.sql`. See [The database](#the-database).                              |
| [`server`](https://github.com/JacobLey/leyman/tree/main/demos/openapi/server)     | The service, Hono on Postgres. See [The server](#the-server).                                                         |

## Why each piece

The spec is the contract, and the one source of truth. It's written in TypeScript with [Juniper](/packages/juniper/), whose schemas carry their types, and `serializeSpec` turns it into a plain `openapi.json` (OpenAPI 3.1), along with the same document as `notes.openapi.yaml`. Both files are committed, and CI fails if either is stale ([populate-files](/packages/populate-files/)). The client and server read those files, as any outside client would, rather than importing the TypeScript.

Each side takes its types straight from the document. The client and server `import type { Operations } from '@leyman/demo-openapi-spec/notes.openapi.yaml'`, and genever-content-mapper, a TypeScript 7.1 content mapper, gives that import [genever](/packages/genever/)'s types as `tsc` runs. Nothing is generated or committed on either side, so there is nothing to go stale, and a change to the spec that breaks a handler or a call is a type error in that package. This needs TypeScript 7.1 (these two packages are on its beta). Their `tsc` targets run trusted-tsc, which passes `--runExternalCode` only for the mapper their `package.json` trusts, sandboxed so it can only read its own packages.

Lint reads the same types from a declaration file. typescript-eslint runs on TypeScript 6, which can't run content mappers, so the spec package also writes genever's types next to the document as `notes.openapi.d.yaml.ts`. TypeScript 6 reads that file for the import through `allowArbitraryExtensions`, and `tsc` 7.1 runs the mapper and ignores it. The file goes away once typescript-eslint can run mappers.

The server also checks every request and response against the document at runtime, with Ajv validators compiled from `openapi.json`. Types only hold inside TypeScript, so the contract is checked again on the wire.

The database schema is whatever the migrations build. Drizzle generates SQL migrations, [pg-dolly-schema](/packages/pg-dolly-schema/) dumps what they build into `schema.sql`, and every test gets its own database cloned from it with [pg-dolly](/packages/pg-dolly/).

## The spec

| Operation    | Method and path        | Auth                  | Responses                                            |
| ------------ | ---------------------- | --------------------- | ---------------------------------------------------- |
| `listNotes`  | `GET /notes?q=&limit=` | Bearer, `notes:read`  | `200 NoteList`, `400`, `401`, `403`                  |
| `createNote` | `POST /notes`          | Bearer, `notes:write` | `201 Note`, `400`, `401`, `403`, `409`, `413`, `422` |
| `getNote`    | `GET /notes/{noteId}`  | Bearer, `notes:read`  | `200 Note`, `400`, `401`, `403`, `404`               |

Every error is an `ApiError` (`{ code, message }`). `createNote` takes an optional `Idempotency-Key` header, so a retry gets the first request's response again rather than adding the note twice. A retry gets a `409` if the first request is still running after waiting 10 seconds for it, and reusing a key on a different request gets a `422` (see [Retrying safely](#retrying-safely)).

`q` keeps only notes whose title contains it, ignoring case. `limit` is 1-100, and defaults to 20. A `403` means the token is valid but lacks the operation's scope, since OpenAPI 3.1 lets an `http` scheme list scopes too, as well as OAuth's. Text can't contain a NUL character (`\u0000`), which Postgres can't store, so a note with one gets a `400` rather than a failed insert.

### How it's built

The document is plain data, with Juniper schemas where the schemas go. [`serializeSpec`](/packages/juniper/guides/openapi#serializing-a-whole-spec) turns each one into JSON Schema 2020-12 (as OpenAPI 3.1 uses), and collects every schema named with `define()` into `components.schemas`, so no `$ref` can be left dangling and nothing has to be listed twice. The paths and security are only a few lines of plain data, so they don't need a builder library.

```ts
import { arraySchema, objectSchema, serializeSpec, stringSchema } from 'juniper';

const note = objectSchema({
    properties: {
        id: stringSchema({ format: 'uuid' }),
        title: stringSchema({ minLength: 1, maxLength: 200 }),
        body: stringSchema({ maxLength: 10_000 }),
        createdAt: stringSchema({ format: 'date-time' }),
    },
    required: ['id', 'title', 'body', 'createdAt'],
    additionalProperties: false,
}).define('Note');

const spec = serializeSpec({
    openapi: '3.1.0',
    info: { title: 'Notes', version: '1.0.0' },
    paths: {
        '/notes': {
            get: {
                operationId: 'listNotes',
                responses: {
                    200: {
                        description: 'The newest notes',
                        content: {
                            'application/json': {
                                schema: objectSchema({
                                    properties: { items: arraySchema(note) },
                                    required: ['items'],
                                    additionalProperties: false,
                                }).define('NoteList'),
                            },
                        },
                    },
                },
            },
        },
    },
});
```

(Trimmed: the [full spec](https://github.com/JacobLey/leyman/tree/main/demos/openapi/spec/src/spec.ts) has every operation, and the bearer security scheme.)

A `populate-files` target writes the document to `out/openapi.json`, and the same document as YAML to `out/notes.openapi.yaml`. Both are committed, and CI fails if either is stale. The package exports only those files. The client and server read the JSON at runtime, and import their types from the YAML through the content mapper, rather than importing the TypeScript. The YAML's name ends in `.openapi.yaml` because TypeScript won't map a `.json` file, and a compound extension leaves other YAML files alone. Next to it, `notes.openapi.d.yaml.ts` holds the same types for typescript-eslint, until typescript-eslint can run content mappers.

The spec's tests check that the document is valid OpenAPI 3.1 with every `$ref` resolving ([`@apidevtools/swagger-parser`](https://www.npmjs.com/package/@apidevtools/swagger-parser)). They also check that every operation requires a bearer token with its scope (`notes:read` or `notes:write`) and documents its `401` and `403`, and that the document only uses security schemes it defines. Every operation must document a `400`, since the server rejects requests that don't match, and only the write may take an `Idempotency-Key`, documenting its `409` and `422`.

## The client

```ts
declare const process: { env: Record<string, string | undefined> };
// ---cut---
import { NotesClient } from '@leyman/demo-openapi-client';

const client = new NotesClient({ baseUrl: 'http://localhost:3000', token: process.env.NOTES_TOKEN });

const created = await client.call('createNote', { body: { title: 'Dolly', body: 'A sheep' } });
switch (created.status) {
    case 201:
        console.log(created.body.id);
        //                  ^?
        break;
    case 400:
    case 401:
    case 403:
    case 409:
    case 413:
    case 422:
        console.error(created.body.message);
        break;
}
```

- The types come from the spec. `import type { Operations } from '@leyman/demo-openapi-spec/notes.openapi.yaml'` is typed by genever-content-mapper as `tsc` runs (the types are genever's, see [genever's OpenAPI guide](/packages/genever/guides/openapi)), so no file is generated or committed. `OperationInput<Id>` and `OperationResult<Id>` are mapped from genever's `Operations`. An operation's `path`, `query` and `header` parameters and its `body` only appear if it has them, and the result is a union of every documented `{ status, body }`, so a `switch` on `status` narrows `body`.
- The routes come from the spec too. The method and path of each operation, and the statuses it documents, are read from `openapi.json` when the module loads. Only the types are generated, so there's no generated runtime code to keep in sync.
- There's one generic `call` rather than a method per operation, so a new operation in the spec works as soon as the spec package is rebuilt.
- Header parameters are sent as headers. `createNote`'s optional `Idempotency-Key` makes a retry safe, as long as you send the same key with every retry of one note, and a new one for the next note.
- The token can be a function, which is called before every request, so a token that expires can be refreshed rather than fixed at startup. Every operation needs a token.
- A status the spec doesn't document (say, a 500) throws `NotesClientUnexpectedStatusError`, rather than being returned as if it matched a type.

An input the spec doesn't allow is a type error:

```ts
import type { NotesClient } from '@leyman/demo-openapi-client';

declare const client: NotesClient;
// ---cut---
// @errors: 2353
await client.call('getNote', { path: { noteId: 'abc' }, body: { title: 'Dolly' } });
```

| Option    | Default            | Description                                                                                        |
| --------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| `baseUrl` | —                  | Where the API is served. Paths in the spec are appended to its path.                               |
| `token`   | —                  | Bearer token, or a function returning one (called before each request). Every operation needs one. |
| `fetch`   | `globalThis.fetch` | Makes the requests, e.g. one with retries or tracing.                                              |

## The server

```ts
declare const process: { env: Record<string, string> };
// ---cut---
import { serve } from '@hono/node-server';
import { createNotesApp, jwtAuthenticator } from '@leyman/demo-openapi-server';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const app = createNotesApp({
    db: drizzle({ client: pool }),
    // Or `staticTokens([{ token: process.env.NOTES_TOKEN, subject: 'ci' }])`, for a fixed list of API keys
    authenticate: jwtAuthenticator({ issuer: 'https://auth.example', audience: 'https://notes.example' }),
    protectedResource: { resource: 'https://notes.example', authorizationServers: ['https://auth.example'] },
    onError: error => console.error(error),
});

serve({ fetch: app.fetch, port: 3000 });
```

### How a request flows

Each operation in `openapi.json` becomes a Hono route (`/notes/{noteId}` → `/notes/:noteId`), served in this order:

1. Authenticate, with the scope the operation's `security` names. A missing or invalid token gets a `401`, and a valid one without the scope gets a `403` (`WWW-Authenticate: Bearer error="insufficient_scope", scope="notes:write"`), as RFC 6750 says. This comes first, so a caller without a token learns nothing about what the operation accepts.
2. Limit the body, if the operation has one. A body over 128 KiB (more than any valid note could take as JSON) gets a `413`. It's refused from its `Content-Length`, or once that much of a chunked body has arrived, rather than read whole and then rejected.
3. Hold the `Idempotency-Key`, if the operation takes one and the request sends one. A retry gets the first response again, without going any further (see [Retrying safely](#retrying-safely)).
4. Validate the request. Path and query parameters arrive as strings, so they're coerced to the schema's types, with its defaults filled in (`limit` is 20 unless given). Then the JSON body is checked (`application/json`, in any case). Anything that doesn't match, including unknown query parameters and properties, gets a `400` that says why.
5. Call the handler, which is typed by genever's `Operations`. It only gets input that matched, and must answer with a documented `{ status, body }`.
6. Validate the response. If a handler answers with an undocumented status, or a body that breaks the schema, the client gets a `500` instead, and `onError` gets a `NotesResponseError`.

A path the spec doesn't have gets a `404`, and a method it doesn't have on a path it does gets a `405` with `Allow`. A handler that throws gets a `500`, reported to `onError`. `onError` gets the error as it was thrown, and Drizzle's errors include the query's parameters, so scrub them before they reach a log service.

Handlers are typed from the spec, so a missing operation, or a response the spec doesn't document, is a type error:

```ts
import type { NotesHandlers } from '@leyman/demo-openapi-server';
// ---cut---
// @errors: 2322
const getNote: NotesHandlers['getNote'] = async ({ path }) => ({
    status: 410,
    body: { code: 'gone', message: `Note ${path.noteId} is gone` },
});
```

### Retrying safely

`createNote` takes an optional `Idempotency-Key` header, handled by [idempotency-keys](/packages/idempotency-keys/), so a client that timed out can send the same request again without adding the note twice:

```ts
import type { NotesClient } from '@leyman/demo-openapi-client';

declare const client: NotesClient;
// ---cut---
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
- The spec says which operations take a key. An operation with an `Idempotency-Key` header parameter gets the middleware, and the parameter's `required` says whether a request without one gets a `400`. `createNote` is the only write, and retrying it is what would add a note twice, while the reads are safe to repeat. A `PUT` or `DELETE` is idempotent by its meaning, so it wouldn't need a key, but a `PATCH` that applies a change relative to the current state, or another `POST`, would.
- The middleware runs after authentication, so a key always belongs to a known caller and a `401` doesn't hold one. It also runs after the body limit, since the key's fingerprint reads the whole body. It runs before validation, so a `400` is kept and replayed too, which is what the same request would get anyway.
- Validation can still read the body, because `handle()` hashes a clone of the request and leaves Hono's `c.req` with the original. The response `handle()` returns is assigned to `c.res` rather than returned. Once a handler has set `c.res`, Hono ignores what a middleware returns ([compose.ts](https://github.com/honojs/hono/blob/v4.13.14/src/compose.ts#L67)), and would send the response whose body `handle()` already read to keep it.
- Every response except a `429` is kept, which is the library's default. That includes a `500`, because a write that failed halfway must not run twice.
- Keys are stored in Postgres, in the `idempotency_keys` table, through the same pool as the handlers. There's no notifier, so a waiting duplicate polls the table, because `LISTEN` needs a connection of its own and the server doesn't own any. A deployment can bind `idempotencyKeysId` to keys with a `PostgresNotifier` to wake waiting requests at once, and should run `deleteExpired()` from a scheduled job, since Postgres doesn't expire rows itself.

### Validation from the document

The validators are compiled once, straight from `openapi.json`, with [Ajv](https://ajv.js.org) (JSON Schema 2020-12) and `ajv-formats` (`uuid`, `date-time`).

- The whole document is added to Ajv, so `$ref`s between components resolve exactly as they do in the document. `components` isn't a JSON Schema keyword, so it's registered as one, which keeps Ajv's strict mode on for everything else.
- Parameters and bodies use separate Ajv instances. Parameters arrive as strings, so their instance coerces types and fills in defaults. Bodies and responses are already JSON, so theirs doesn't coerce, and `"5"` isn't accepted as a number.
- The parameters in each location (path or query) become one object schema with `additionalProperties: false`, so they're validated together.

### Authentication

An `Authenticator` gets the token and the operation's scopes, and answers with the `Caller` (`{ subject }`, who the token is for), `invalid` (a `401`) or `insufficient_scope` (a `403`). Each handler gets the caller, and only sees the caller's notes. Another user's note is a `404`, as if it didn't exist, so an id says nothing about whose note it is. There are two built-in authenticators.

- `jwtAuthenticator({ issuer, audience })` accepts JWT access tokens (RFC 9068) from an authorization server. A token must be signed with one of the issuer's keys (found by OpenID Connect discovery, then cached by `jose`), issued by it, for this API (`aud`, so a token meant for another service from the same issuer is refused), not expired, and have every scope needed. The caller is the token's subject (`sub`, which RFC 9068 requires), and it has to be a user. A service's own token (client credentials) has its `client_id` as `sub`, and is refused, since the service would otherwise act as a user named after itself. Only a token that's wrong is `invalid`. When the issuer can't be reached (its discovery document or its keys answer with an error), the request gets a `500` reported to `onError`, since the token may well be fine, and discovery is retried on the next request. The [dev OAuth server](https://github.com/JacobLey/leyman/tree/main/tools/oauth-dev-server) issues these tokens in the tests.
- `staticTokens([{ token, subject }])` accepts a fixed list of tokens (API keys from a secret store, say), each for its subject and with every scope. Each token is hashed (SHA-256) and compared with `timingSafeEqual` against every allowed token, so neither how long a comparison takes nor where a match is found says anything about a guess.

With `protectedResource`, the API also serves its Protected Resource Metadata (RFC 9728) at `/.well-known/oauth-protected-resource`, listing its authorization server and scopes, and every challenge points to it (`resource_metadata="..."`). `resource` is where the API is served. If it has a path (because a proxy mounts the API under one), the metadata is served under that path too, where RFC 9728 places it. A client then only needs the API's URL to log in.

### The database

The schema is a package of its own, so `schema.sql` (generated against a real database) is an output the server consumes, like `openapi.json`. It only rebuilds when the migrations or the Postgres versions change, rather than on every handler edit.

The Drizzle schema puts the defaults in the database, so every test database has them too. The id defaults to `uuidv7()`, which is ordered by time, so notes made in the same transaction still list in order, and the time defaults to `now()`. `uuidv7()` needs Postgres 18, which the devcontainer and CI run. Each note has an `owner` (the `sub` of the token that made it), and the index that `listNotes` reads starts with it, so it lists one owner's notes, newest first.

Migrations are plain SQL, generated and then reviewed. `drizzle-kit generate --name <name>` writes them to `migrations/`, and a `drizzle-kit-check` target fails CI if the schema has changes that no migration covers. `0002_add-note-owner` adds `owner` as `NOT NULL` with no default, which only works on an empty table. That's fine for a demo with no deployed data, but a table with rows would need the column added in steps (nullable, backfilled, then `NOT NULL`).

`idempotency_keys` is [idempotency-keys](/packages/idempotency-keys/)'s table. `0003_add-idempotency-keys` is a custom migration (`drizzle-kit generate --custom`) that holds the library's `createTableSql()` as it is, and a test checks that the two are identical, so the table matches the [specification](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md#postgres) that other implementations share. The library queries it with its own SQL, so it isn't a Drizzle table, and `drizzle-kit generate` leaves it alone.

`schema.sql` is what the migrations build, kept up to date by [pg-dolly-schema](/packages/pg-dolly-schema/) running `drizzle-kit migrate` on an empty database. It includes Drizzle's own `drizzle.__drizzle_migrations` table with its rows (`--data`), so every test database knows its migrations have run, and migrating one does nothing.

Handlers trust their input, since validation has already happened. `listNotes` uses the `limit` it's given, with the spec's default filled in. `q` is matched with `ILIKE`, with its `%`, `_` and `\` escaped so they match themselves. The types reflect this too. Handlers take genever's `OperationRequest` (`--parameter-defaults`), where `limit` is always present, rather than the caller's view, where it's optional.

### Composing with haywire

`createNotesApp` covers the common case. Underneath, each part is a [haywire](/packages/haywire/) binding, so an app (or a test) can swap them one at a time:

| Identifier          | Bound by                                                       | Default                                                                              |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `databaseId`        | the app: Drizzle on a pool it owns, never closed by the server | —                                                                                    |
| `authenticatorId`   | the app                                                        | `jwtAuthenticatorBinding(options)` or `staticTokensBinding(tokens)`                  |
| `appConfigId`       | the app: `onError`, and `protectedResource`                    | —                                                                                    |
| `handlersId`        | `notesModule`                                                  | `drizzleHandlersBinding`                                                             |
| `idempotencyKeysId` | `notesModule`                                                  | `postgresIdempotencyKeysBinding`: Postgres, through `databaseId`'s pool, no notifier |
| `notesAppId`        | `notesModule`                                                  | the Hono app                                                                         |

```ts
import type { Authenticator, NotesDatabase } from '@leyman/demo-openapi-server';

declare const db: NotesDatabase;
declare const introspect: Authenticator;
declare const report: (error: Error) => void;
// ---cut---
import {
    appConfigId,
    authenticatorId,
    databaseId,
    notesAppId,
    notesModule,
} from '@leyman/demo-openapi-server';
import { bind, createContainer } from 'haywire';

const app = createContainer(
    notesModule
        .addBinding(bind(databaseId).withInstance(db))
        .addBinding(bind(authenticatorId).withInstance(introspect))
        .addBinding(bind(appConfigId).withInstance({ onError: report }))
).get(notesAppId);
```

## Testing

- Every test gets its own database, cloned by [pg-dolly](/packages/pg-dolly/) from `schema.sql`, with the [mocha-chain fixture](/packages/pg-dolly/guides/test-runners#mocha-chain) from its docs. The template is built once per run, and the tests run against a real Postgres, which is a devcontainer sidecar locally and a service in CI.
- The app is served on a free port with `@hono/node-server`, exactly as in production. Requests go through the typed client, or plain `fetch` for requests the client can't send (bad JSON, the wrong content type).
- Responses that break the spec are tested by swapping in handlers that break it, one binding at a time.
- Idempotency keys are tested against the same Postgres. The tests cover replays, a reused key's `422`, a duplicate that waits on a running request (held open until the store reports that the duplicate found the key held, so nothing depends on timing) or gets a `409`, callers kept apart, and a response that is still sent when its key can't be stored.
- The client's unit tests use a `fetch` that records each request and answers with a canned response, and one test uses the real `fetch` against a local HTTP server.

One test posts notes generated from the document with [`juniper-arbitrary`](/packages/juniper-arbitrary/), and checks they come back as sent. Text is where a server and a database tend to disagree, and hand-written cases only cover the characters someone thought of.

## What was learned

- Nx expands `$` in a target's options. Options are forwarded to the command in double quotes, so a migrate command containing `$DATABASE_URL` would run against the server's default database. The migrate command is set in `env` instead (see [pg-dolly-schema as an Nx target](/packages/pg-dolly-schema/getting-started#as-an-nx-target)).
- drizzle-kit doesn't declare what it imports. It loads `drizzle-orm` and the `pg` driver from its own install location, which pnpm's strict layout doesn't allow, so a `packageExtensions` entry in `pnpm-workspace.yaml` makes them peers.
- `drizzle-kit migrate` adds its own bookkeeping table (`drizzle.__drizzle_migrations`). A schema-only dump kept the table but not its rows, so a test database looked unmigrated, and migrating it would have run every migration again. `pg-dolly-schema --data` keeps the rows too.
- drizzle-kit has no check-only mode to find schema changes that no migration covers. The `drizzle-kit-check` target generates into a copy of the migrations, through a temporary config that only changes `out`, and compares the two.
- drizzle-kit exits 0 when it fails. Without a terminal it can't ask whether a column was renamed, so it prints an error, writes nothing, and exits 0. A check that only compared files would pass, so the check fails on any error output instead.
- Hono ignores a middleware's return value once a later handler has set `c.res`. A middleware that wraps the rest of the route (idempotency-keys' `handle()`, which reads the response to keep it and returns a copy) has to assign its response to `c.res`, or Hono sends the original, whose body has already been read.
- Fastify was the other option. It validates requests natively from per-route schemas, but its response schemas only drive serialization (dropping unknown fields) and don't validate. With Hono, both directions are explicit middleware against the document.

## Not covered

- Optional request bodies, other content types, header parameters other than `Idempotency-Key` (which the middleware reads, rather than Ajv), cookie parameters, and response headers. The spec has none of these, so the server has no code for them.
- Pagination beyond a `limit` (cursors), rate limiting, and CORS. Tokens are issued by an authorization server, and the API only verifies them.
- Spec linting beyond the spec package's own tests (e.g. [Spectral](https://github.com/stoplightio/spectral)).
- The cost of validating every response in production. It catches a handler breaking the contract before a client does, but a busy service might only sample.
