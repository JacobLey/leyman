# demo-openapi-spec

The OpenAPI document of the OpenAPI demo's notes API, built from Juniper schemas and published as openapi.json.

Part of the [OpenAPI demo](../README.md). A worked example, never published.

## The API

| Operation | Method and path | Auth | Responses |
|---|---|---|---|
| `listNotes` | `GET /notes?limit=` | — | `200 NoteList`, `400` |
| `createNote` | `POST /notes` | Bearer | `201 Note`, `400`, `401` |
| `getNote` | `GET /notes/{noteId}` | — | `200 Note`, `400`, `404` |

Every error is an `ApiError` (`{ code, message }`). `limit` is 1-100, default 20.

## How it's built

[`src/spec.ts`](./src/spec.ts) is the document as plain data, with [Juniper](../../../apps/juniper) schemas where the schemas go. Juniper's `serializeSpec` turns each into JSON Schema 2020-12 (OpenAPI 3.1), and collects every schema given a name with `define()` into `components.schemas`, so no `$ref` can be left dangling and nothing has to be listed twice. No builder library is needed for the paths and security: they are a few lines of plain data.

The `populate-files` target writes it to `out/openapi.json`, committed, and CI fails if it's stale. The package exports only that file (`@leyman/demo-openapi-spec/openapi.json`): the client and server read the JSON, never the TypeScript, as any outside consumer would.

## Checks

The tests check that the document:

- is valid OpenAPI 3.1, with every `$ref` resolving ([`@apidevtools/swagger-parser`](https://www.npmjs.com/package/@apidevtools/swagger-parser))
- requires a bearer token for every operation that writes, and documents its `401`
- uses only security schemes it defines
- documents a `400` for every operation, since the server rejects requests that don't match
