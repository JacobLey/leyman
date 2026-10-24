---
description: A small notes API with the whole path from spec to database built properly - an OpenAPI 3.1 document from Juniper schemas, genever types, a typed client, and a Hono server on Postgres that validates every request and response.
---

# OpenAPI

<ProjectHeader />

A deliberately small API (notes: add one, read one, list the newest), with the whole path from spec to database built properly, since connecting those parts is what the demo shows:

```
spec (juniper) ──► openapi.json ──┬──► client: genever types + a typed fetch client
                                  └──► server: genever types + Hono, validating against openapi.json
                                         ▲ Drizzle tables, and schema.sql for pg-dolly per test
database: Drizzle migrations ──► schema.sql (what the migrations build, against Postgres)
```

Worked examples, not packages: none is published. Each is a full package (lint, types, 100% coverage), and the server's tests run against a real Postgres.

| Package | Output |
|---|---|
| [`spec`](https://github.com/JacobLey/leyman/tree/main/demos/openapi/spec) | `openapi.json`, built from [Juniper](/packages/juniper/) schemas. See [The spec](#the-spec). |
| [`client`](https://github.com/JacobLey/leyman/tree/main/demos/openapi/client) | A typed client, from `openapi.json`. See [The client](#the-client). |
| [`database`](https://github.com/JacobLey/leyman/tree/main/demos/openapi/database) | The Drizzle schema, its migrations, and `schema.sql`. See [The database](#the-database). |
| [`server`](https://github.com/JacobLey/leyman/tree/main/demos/openapi/server) | The service: Hono on Postgres. See [The server](#the-server). |

## Why each piece

- **The spec is the contract, and the one source of truth.** It's written in TypeScript with [Juniper](/packages/juniper/), whose schemas carry their types, and `serializeSpec` turns it into a plain `openapi.json` (OpenAPI 3.1). That file is committed, and CI fails if it's stale ([populate-files](/packages/populate-files/)). Both sides read the file, as any outside client would, never the TypeScript.
- **Types are generated from the file, on each side.** [genever](/packages/genever/) writes `Paths` and `Operations` types into each package's `src/generated/`, from the spec package's `openapi.json` as installed. A change to the spec that breaks a handler or a call is a type error in that package.
- **The server checks every request and response against the document at runtime**, with Ajv compiled from `openapi.json`. Types only hold within TypeScript, so the contract is checked again on the wire.
- **The database schema is what the migrations build.** Drizzle generates SQL migrations, [pg-dolly-schema](/packages/pg-dolly-schema/) dumps what they build into `schema.sql`, and every test gets a database of its own cloned from it with [pg-dolly](/packages/pg-dolly/).

## The spec

| Operation | Method and path | Auth | Responses |
|---|---|---|---|
| `listNotes` | `GET /notes?q=&limit=` | Bearer, `notes:read` | `200 NoteList`, `400`, `401`, `403` |
| `createNote` | `POST /notes` | Bearer, `notes:write` | `201 Note`, `400`, `401`, `403`, `413` |
| `getNote` | `GET /notes/{noteId}` | Bearer, `notes:read` | `200 Note`, `400`, `401`, `403`, `404` |

Every error is an `ApiError` (`{ code, message }`). `q` keeps only notes whose title contains it, ignoring case. `limit` is 1-100, default 20. A `403` is a valid token without the operation's scope: OpenAPI 3.1 lets an `http` scheme list scopes too, not only OAuth's. Text can't contain a NUL character (`\u0000`), which Postgres can't store, so a note with one is a `400` rather than a failed insert.

### How it's built

The document is plain data, with Juniper schemas where the schemas go. [`serializeSpec`](/packages/juniper/guides/openapi#serializing-a-whole-spec) turns each into JSON Schema 2020-12 (as OpenAPI 3.1 uses), and collects every schema given a name with `define()` into `components.schemas`, so no `$ref` can be left dangling and nothing has to be listed twice. No builder library is needed for the paths and security: they are a few lines of plain data.

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

A `populate-files` target writes it to `out/openapi.json`, committed, and CI fails if it's stale. The package exports only that file (`@leyman/demo-openapi-spec/openapi.json`): the client and server read the JSON, never the TypeScript.

The spec's tests check that the document is valid OpenAPI 3.1 with every `$ref` resolving ([`@apidevtools/swagger-parser`](https://www.npmjs.com/package/@apidevtools/swagger-parser)), that every operation requires a bearer token with its scope (`notes:read` or `notes:write`) and documents its `401` and `403`, that it uses only security schemes it defines, and that every operation documents a `400`, since the server rejects requests that don't match.

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
    case 413:
        console.error(created.body.message);
        break;
}
```

- **Types come from the spec.** A `genever` target writes `src/generated/api.ts` from `openapi.json` (see [genever's OpenAPI guide](/packages/genever/guides/openapi)), and CI fails if it's stale. `OperationInput<Id>` and `OperationResult<Id>` are mapped from genever's `Operations`: an operation's `path`, `query` and `body` appear only if it has them, and the result is a union of every documented `{ status, body }`, so a `switch` on `status` narrows `body`.
- **Routes come from the spec too.** The method and path of each operation, and the statuses it documents are read from `openapi.json` when the module loads. Only the types are generated, so there's no generated runtime code to keep in sync.
- **One generic `call`**, rather than a method per operation: a new operation in the spec works as soon as the types are regenerated.
- **The token can be a function**, called before every request, so a token that expires is refreshed rather than baked in. Every operation needs one.
- **A status the spec doesn't document** (say, a 500) throws `NotesClientUnexpectedStatusError`, rather than being returned as if it matched a type.

An input the spec doesn't allow is a type error:

```ts
import type { NotesClient } from '@leyman/demo-openapi-client';

declare const client: NotesClient;
// ---cut---
// @errors: 2353
await client.call('getNote', { path: { noteId: 'abc' }, body: { title: 'Dolly' } });
```

| Option | Default | Description |
|---|---|---|
| `baseUrl` | — | Where the API is served. Paths in the spec are appended to its path. |
| `token` | — | Bearer token, or a function returning one (called before each request). Every operation needs one. |
| `fetch` | `globalThis.fetch` | Makes the requests, e.g. one with retries or tracing. |

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

1. **Authenticate**, with the scope the operation's `security` names: no token or an invalid one is a `401`, a valid one without the scope a `403` (`WWW-Authenticate: Bearer error="insufficient_scope", scope="notes:write"`), as RFC 6750 says. This comes first, so a caller without a token learns nothing about what the operation accepts.
2. **Limit the body**, if the operation has one: a body over 128 KiB (more than any valid note could take as JSON) is a `413`, refused from its `Content-Length`, or once that much of a chunked body has arrived, rather than read whole and then rejected.
3. **Validate the request**: path and query parameters (strings, coerced to the schema's types, with its defaults filled in: `limit` is 20 unless given), then the JSON body (`application/json`, in any case). Anything that doesn't match, including unknown query parameters and properties, is a `400` saying why.
4. **Call the handler**, typed by genever's `Operations`: it gets only input that matched, and must answer with a documented `{ status, body }`.
5. **Validate the response.** A handler that answers with an undocumented status, or a body that breaks the schema, never reaches the client: it gets a `500`, and `onError` gets a `NotesResponseError`.

A path the spec doesn't have is a `404`, a method it doesn't have on a path it does is a `405` with `Allow`, and a handler that throws is a `500`, reported to `onError`. `onError` gets the error as thrown: Drizzle's include the query's parameters, so scrub them before they reach a log service.

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

### Validation from the document

The validators are compiled once, with [Ajv](https://ajv.js.org) (JSON Schema 2020-12) and `ajv-formats` (`uuid`, `date-time`), straight from `openapi.json`:

- **The whole document is added to Ajv**, so `$ref`s between components resolve exactly as in the document. `components` isn't a JSON Schema keyword, so it's registered as one, which keeps Ajv's strict mode on for everything else.
- **Parameters and bodies use separate Ajv instances.** Parameters arrive as strings, so theirs coerces types and fills in defaults. Bodies and responses are JSON already: theirs never coerces, so `"5"` is not a number.
- **Each location's parameters become one object schema** with `additionalProperties: false`, so they validate together.

### Authentication

An `Authenticator` gets the token and the operation's scopes, and answers with the `Caller` (`{ subject }`, who the token is for), `invalid` (a `401`) or `insufficient_scope` (a `403`). Each handler gets the caller, and sees only the caller's notes: another user's note is a `404`, as if it didn't exist, so an id says nothing about whose it is. Two are built in:

- **`jwtAuthenticator({ issuer, audience })`** accepts JWT access tokens (RFC 9068) from an authorization server: signed with one of its keys (found by OpenID Connect discovery, then cached by `jose`), issued by it, for this API (`aud`, so a token meant for another service from the same issuer is refused), not expired, and with every scope needed, as its subject (`sub`, which RFC 9068 requires). Only a token that's wrong is `invalid`: an issuer that can't be reached (its discovery document, or its keys answering an error) is a `500` reported to `onError`, since the token may well be fine. Discovery is retried on the next request. A [dev OAuth server](https://github.com/JacobLey/leyman/tree/main/demos/oauth-server) issues such tokens in the tests.
- **`staticTokens([{ token, subject }])`** accepts a fixed list (e.g. API keys from a secret store), each for its subject, with every scope. Each token is hashed (SHA-256) and compared with `timingSafeEqual` against every allowed token, so neither the time a comparison takes nor where a match is found says anything about a guess.

With `protectedResource`, the API also serves its Protected Resource Metadata (RFC 9728) at `/.well-known/oauth-protected-resource`, listing its authorization server and scopes, and every challenge points to it (`resource_metadata="..."`). `resource` is where the API is served: with a path (the API mounted under it by a proxy), the metadata is served under that path too, as RFC 9728 places it. A client then needs only the API's URL to log in.

### The database

- **The schema is a package of its own**, so `schema.sql` (generated against a real database) is an output the server consumes, like `openapi.json`, and only rebuilds when the migrations or the Postgres versions change, not on every handler edit.
- **The Drizzle schema puts the defaults in the database**: the id (`uuidv7()`, ordered by time, so notes made in the same transaction still list in order) and the time (`now()`), so every test database has them too. `uuidv7()` needs Postgres 18, which the devcontainer and CI run. Each note has an `owner` (the `sub` of the token that made it), and the index `listNotes` reads leads with it: one owner's notes, newest first.
- **Migrations are SQL, generated and reviewed**: `drizzle-kit generate --name <name>` writes them to `migrations/`. A `drizzle-kit-check` target fails CI if the schema has changes no migration covers. `0002_add-note-owner` adds `owner` as `NOT NULL` with no default, which only works on an empty table: right for a demo with no deployed data, while a table with rows would need it added in steps (nullable, backfilled, then `NOT NULL`).
- **`schema.sql` is what the migrations build**, kept by [pg-dolly-schema](/packages/pg-dolly-schema/) running `drizzle-kit migrate` on an empty database. It includes Drizzle's own `drizzle.__drizzle_migrations` table, rows and all (`--data`), so every test database knows its migrations ran, and migrating one does nothing.
- **Handlers trust their input.** Validation already happened, so `listNotes` uses the `limit` it's given, with the spec's default filled in. `q` is matched with `ILIKE`, its `%`, `_` and `\` escaped so they match themselves. The type says so too: handlers take genever's `OperationRequest` (`--parameter-defaults`), where `limit` is always there, rather than the caller's view, where it's optional.

### Composing with haywire

`createNotesApp` covers the common case. Underneath, each part is a [haywire](/packages/haywire/) binding, so an app (or a test) swaps one at a time:

| Identifier | Bound by | Default |
|---|---|---|
| `databaseId` | the app: Drizzle on a pool it owns, never closed by the server | — |
| `authenticatorId` | the app | `jwtAuthenticatorBinding(options)` or `staticTokensBinding(tokens)` |
| `appConfigId` | the app: `onError`, and `protectedResource` | — |
| `handlersId` | `notesModule` | `drizzleHandlersBinding` |
| `notesAppId` | `notesModule` | the Hono app |

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

- **Every test gets a database of its own**, cloned by [pg-dolly](/packages/pg-dolly/) from `schema.sql`, with the [mocha-chain fixture](/packages/pg-dolly/guides/test-runners#mocha-chain) from its docs. The template is built once per run, and the tests run against the real Postgres: a devcontainer sidecar, and a service in CI.
- **The app is served on a free port** with `@hono/node-server`, exactly as in production, and requests go through the typed client, or plain `fetch` for requests the client can't send (bad JSON, the wrong content type).
- **Breaking responses are tested** by swapping in handlers that break the spec, one binding at a time.
- **The client's unit tests** use a `fetch` that records each request and answers with a canned response, and one uses the real `fetch` against a local HTTP server.

## What was learned

- **Nx expands `$` in a target's options.** Options are forwarded to the command in double quotes, so a migrate command containing `$DATABASE_URL` would run against the server's default database. The migrate command is set in `env` instead (see [pg-dolly-schema as an Nx target](/packages/pg-dolly-schema/getting-started#as-an-nx-target)).
- **drizzle-kit doesn't declare what it imports.** It loads `drizzle-orm` and the `pg` driver from its own install location, which pnpm's strict layout doesn't allow. A `packageExtensions` entry in `pnpm-workspace.yaml` makes them peers.
- **`drizzle-kit migrate` adds its own bookkeeping** (`drizzle.__drizzle_migrations`). A schema-only dump kept the table but not its rows, so a test database looked unmigrated, and migrating it would have run every migration again. `pg-dolly-schema --data` keeps its rows too.
- **drizzle-kit has no check-only mode** for "the schema has changes no migration covers". The `drizzle-kit-check` target generates into a copy of the migrations, through a temporary config that only changes `out`, and compares.
- **drizzle-kit exits 0 when it fails.** Without a terminal, it can't ask whether a column was renamed, so it prints an error, writes nothing, and exits 0. A check that only compared files would pass. The check fails on any error output instead.
- **Fastify was the other option.** It validates requests natively from per-route schemas, but its response schemas only drive serialization (dropping unknown fields), not validation. With Hono, both directions are explicit middleware against the document.

## Not covered

- Optional request bodies, other content types, header and cookie parameters, and response headers. The spec has none, so the server has no code for them.
- Pagination beyond a `limit` (cursors), rate limiting, and CORS. Tokens are issued by an authorization server; the API only verifies them.
- Spec linting beyond the spec package's own tests (e.g. [Spectral](https://github.com/stoplightio/spectral)).
- The cost of validating every response in production. It catches a handler breaking the contract before a client does, but a busy service might only sample.
