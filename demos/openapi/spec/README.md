# demo-openapi-spec

The OpenAPI document of the OpenAPI demo's notes API, built from Juniper schemas and published as openapi.json.

Part of the [OpenAPI demo](../README.md). A worked example, never published.

## The API

| Operation | Method and path | Auth | Responses |
|---|---|---|---|
| `listNotes` | `GET /notes?q=&limit=` | Bearer, `notes:read` | `200 NoteList`, `400`, `401`, `403` |
| `createNote` | `POST /notes` | Bearer, `notes:write` | `201 Note`, `400`, `401`, `403`, `413` |
| `getNote` | `GET /notes/{noteId}` | Bearer, `notes:read` | `200 Note`, `400`, `401`, `403`, `404` |

Every error is an `ApiError` (`{ code, message }`). `q` keeps only notes whose title contains it, ignoring case. `limit` is 1-100, default 20. A `403` is a valid token without the operation's scope: OpenAPI 3.1 lets an `http` scheme list scopes too, not only OAuth's. Text can't contain a NUL character (`\u0000`), which Postgres can't store, so a note with one is a `400` rather than a failed insert.

## How it's built

[`src/spec.ts`](./src/spec.ts) is the document as plain data, with [Juniper](../../../apps/juniper) schemas where the schemas go. Juniper's `serializeSpec` turns each into JSON Schema 2020-12 (OpenAPI 3.1), and collects every schema given a name with `define()` into `components.schemas`, so no `$ref` can be left dangling and nothing has to be listed twice. No builder library is needed for the paths and security: they are a few lines of plain data.

The `populate-files` target writes it to `out/openapi.json`, committed, and CI fails if it's stale. The package exports only that file (`@leyman/demo-openapi-spec/openapi.json`): the client and server read the JSON, never the TypeScript, as any outside consumer would.

## Checks

The tests check that the document:

- is valid OpenAPI 3.1, with every `$ref` resolving ([`@apidevtools/swagger-parser`](https://www.npmjs.com/package/@apidevtools/swagger-parser))
- requires a bearer token for every operation, with `notes:read` to read and `notes:write` to write, and documents its `401` and `403`
- uses only security schemes it defines
- documents a `400` for every operation, since the server rejects requests that don't match
