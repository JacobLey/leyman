# demo-openapi-server

The OpenAPI demo's notes API: Hono on Postgres with Drizzle, validating every request and response against openapi.json, with bearer authentication (static tokens or JWTs) and scopes.

Part of the [OpenAPI demo](../README.md). A worked example, never published.

## Contents
- [Example](#example)
- [How a request flows](#how-a-request-flows)
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
3. **Validate the request**: path and query parameters (strings, coerced to the schema's types, with its defaults filled in: `limit` is 20 unless given), then the JSON body (`application/json`, in any case). Anything that doesn't match, including unknown query parameters and properties, is a `400` saying why.
4. **Call the handler**, typed by genever's `Operations`: it gets only input that matched, and must answer with a documented `{ status, body }`.
5. **Validate the response**. A handler that answers with an undocumented status, or a body that breaks the schema, never reaches the client: it gets a `500`, and `onError` gets a `NotesResponseError`.

A path the spec doesn't have is a `404`, a method it doesn't have on a path it does is a `405` with `Allow`, and a handler that throws is a `500`, reported to `onError`. `onError` gets the error as thrown: Drizzle's include the query's parameters, so scrub them before they reach a log service.

## Validation from the document

The validators are compiled once, with Ajv (JSON Schema 2020-12, as OpenAPI 3.1 uses) and `ajv-formats` (`uuid`, `date-time`), straight from `openapi.json`:

- **The whole document is added to Ajv**, so `$ref`s between components resolve exactly as in the document. `components` isn't a JSON Schema keyword, so it's registered as one, which keeps Ajv's strict mode on for everything else.
- **Parameters and bodies use separate Ajv instances.** Parameters arrive as strings, so theirs coerces types and fills in defaults. Bodies and responses are JSON already: theirs never coerces, so `"5"` is not a number.
- **Each location's parameters become one object schema** with `additionalProperties: false`, so they validate together.

## Authentication

An `Authenticator` gets the token and the operation's scopes, and answers with the `Caller` (`{ subject }`, who the token is for), `invalid` (a `401`) or `insufficient_scope` (a `403`). Each handler gets the caller, and sees only the caller's notes: another user's note is a `404`, as if it didn't exist, so an id says nothing about whose it is. Two are built in:

- **`jwtAuthenticator({ issuer, audience })`** accepts JWT access tokens (RFC 9068) from an authorization server: signed with one of its keys (found by OpenID Connect discovery, then cached by `jose`), issued by it, for this API (`aud`, so a token meant for another service from the same issuer is refused), not expired, and with every scope needed, as its subject (`sub`, which RFC 9068 requires). Only a token that's wrong is `invalid`: an issuer that can't be reached (its discovery document, or its keys answering an error) is a `500` reported to `onError`, since the token may well be fine. Discovery is retried on the next request. The [dev OAuth server](../../../tools/oauth-dev-server) issues such tokens in the tests.
- **`staticTokens([{ token, subject }])`** accepts a fixed list (e.g. API keys from a secret store), each for its subject, with every scope. Each token is hashed (SHA-256) and compared with `timingSafeEqual` against every allowed token, so neither the time a comparison takes nor where a match is found says anything about a guess.

With `protectedResource`, the API also serves its Protected Resource Metadata (RFC 9728) at `/.well-known/oauth-protected-resource`, listing its authorization server and scopes, and every challenge points to it (`resource_metadata="..."`). `resource` is where the API is served: with a path (the API mounted under it by a proxy), the metadata is served under that path too, as RFC 9728 places it. A client then needs only the API's URL to log in: the [notes CLI](../../agents/cli) does just that.

## The database

- **The schema is in [`database`](../database)**: the Drizzle tables, their migrations, and `schema.sql`, what the migrations build. The server queries the `notes` table it exports.
- **Handlers trust their input.** Validation already happened, so `listNotes` uses the `limit` it's given, with the spec's default filled in. `q` is matched with `ILIKE`, its `%`, `_` and `\` escaped so they match themselves. The type says so too: handlers take genever's `OperationRequest` (`--parameter-defaults`), where `limit` is always there, rather than the caller's view, where it's optional.

## Composing with haywire

`createNotesApp` covers the common case. Underneath, each part is a [haywire](../../../tools/haywire) binding, so an app (or a test) swaps one at a time:

| Identifier | Bound by | Default |
|---|---|---|
| `databaseId` | the app: Drizzle on a pool it owns, never closed by the server | — |
| `authenticatorId` | the app | `jwtAuthenticatorBinding(options)` or `staticTokensBinding(tokens)` |
| `appConfigId` | the app: `onError`, and `protectedResource` | — |
| `handlersId` | `notesModule` | `drizzleHandlersBinding` |
| `notesAppId` | `notesModule` | the Hono app |

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
