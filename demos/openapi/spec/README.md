# demo-openapi-spec

The OpenAPI document of the OpenAPI demo's notes API, built from Juniper schemas and published as openapi.json and notes.openapi.yaml.

Part of the [OpenAPI demo](../README.md). It's a worked example, and isn't published.

## The API

| Operation    | Method and path        | Auth                  | Responses                                            |
| ------------ | ---------------------- | --------------------- | ---------------------------------------------------- |
| `listNotes`  | `GET /notes?q=&limit=` | Bearer, `notes:read`  | `200 NoteList`, `400`, `401`, `403`                  |
| `createNote` | `POST /notes`          | Bearer, `notes:write` | `201 Note`, `400`, `401`, `403`, `409`, `413`, `422` |
| `getNote`    | `GET /notes/{noteId}`  | Bearer, `notes:read`  | `200 Note`, `400`, `401`, `403`, `404`               |

Every error is an `ApiError` (`{ code, message }`). `createNote` takes an optional `Idempotency-Key` header, so a retry gets the first request's response again rather than adding the note twice. A retry gets a `409` if the first request is still running after waiting 10 seconds for it, and reusing a key on a different request gets a `422`. The [server](../server/README.md#retrying-safely) explains how this works.

`q` keeps only notes whose title contains it, ignoring case. `limit` is 1-100, and defaults to 20. A `403` means the token is valid but lacks the operation's scope, since OpenAPI 3.1 lets an `http` scheme list scopes too, as well as OAuth's. Text can't contain a NUL character (`\u0000`), which Postgres can't store, so a note with one gets a `400` rather than a failed insert.

## How it's built

[`src/spec.ts`](./src/spec.ts) is the document as plain data, with [Juniper](../../../apps/juniper) schemas where the schemas go. Juniper's `serializeSpec` turns each one into JSON Schema 2020-12 (as OpenAPI 3.1 uses), and collects every schema named with `define()` into `components.schemas`, so no `$ref` can be left dangling and nothing has to be listed twice. The paths and security are only a few lines of plain data, so they don't need a builder library.

The `populate-files` target writes the document to `out/openapi.json`, and the same document as YAML to `out/notes.openapi.yaml`. Both are committed, and CI fails if either is stale. The package exports only those files. The client and server read the JSON at runtime (`@leyman/demo-openapi-spec/openapi.json`), and import their types from the YAML (`@leyman/demo-openapi-spec/notes.openapi.yaml`) through [genever-content-mapper](../../../apps/genever-content-mapper), as any outside consumer would, rather than importing the TypeScript. The YAML's name ends in `.openapi.yaml` because TypeScript won't map a `.json` file, and a compound extension leaves other YAML files alone.

It also writes `out/notes.openapi.d.yaml.ts`, which holds genever's types for the YAML (with `OperationRequest`, which only the server uses) for tools that can't run content mappers. typescript-eslint, on TypeScript 6, reads it for the import through `allowArbitraryExtensions`, and `tsc` 7.1 runs the mapper and ignores it. The file goes away once typescript-eslint can run mappers.

## Checks

The tests check that the document:

- is valid OpenAPI 3.1, with every `$ref` resolving ([`@apidevtools/swagger-parser`](https://www.npmjs.com/package/@apidevtools/swagger-parser))
- requires a bearer token for every operation, with `notes:read` to read and `notes:write` to write, and documents its `401` and `403`
- uses only security schemes it defines
- documents a `400` for every operation, since the server rejects requests that don't match
- takes an `Idempotency-Key` on its write (and only there), documenting the `409` and `422` it may answer
