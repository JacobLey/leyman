# demo-openapi-client

A typed client for the OpenAPI demo's notes API: types imported from the spec through a content mapper, routes read from openapi.json at runtime.

Part of the [OpenAPI demo](../README.md). A worked example, never published.

## Example

```ts
import { NotesClient } from '@leyman/demo-openapi-client';

const client = new NotesClient({ baseUrl: 'http://localhost:3000', token: process.env.NOTES_TOKEN });

const created = await client.call('createNote', { body: { title: 'Dolly', body: 'A sheep' } });
switch (created.status) {
    case 201:
        console.log(created.body.id); // `body` is a `Note`
        break;
    case 400:
    case 401:
    case 413:
        console.error(created.body.message); // `body` is an `ApiError`
        break;
}
```

## How it works

- **Types come from the spec.** `import type { Operations } from '@leyman/demo-openapi-spec/notes.openapi.yaml'` is typed by [genever-content-mapper](../../../apps/genever-content-mapper) as `tsc` runs, so no file is generated or committed. It needs TypeScript 7.1 (this package is on its beta, `catalog:typescript-next`): `tsconfig.json` registers the mapper for `.openapi.yaml` in `contentMappers`, `package.json` trusts it in `trustedContentMappers`, and the `tsc` targets run [trusted-tsc](../../../apps/trusted-tsc), which runs `tsc` with the mapper in Node's permission sandbox. `OperationInput<Id>` and `OperationResult<Id>` are mapped from genever's `Operations`: an operation's `path`, `query` and `body` appear only if it has them, and the result is a union of every documented `{ status, body }`, so a `switch` on `status` narrows `body`.
- **Routes come from the spec too.** The method and path of each operation, and the statuses it documents are read from `openapi.json` when the module loads. Only the types are generated, so there's no generated runtime code to keep in sync.
- **One generic `call`**, rather than a method per operation: a new operation in the spec works as soon as the spec package is rebuilt.
- **The token can be a function**, called before every request, so a token that expires is refreshed rather than baked in.
- **A status the spec doesn't document** (say, a 500) throws `NotesClientUnexpectedStatusError` rather than being returned as if it matched a type.

## Options

| Option | Default | Description |
|---|---|---|
| `baseUrl` | — | Where the API is served. Paths in the spec are appended to its path. |
| `token` | — | Bearer token, or a function returning one (called before each request). Every operation needs one. |
| `fetch` | `globalThis.fetch` | Makes the requests, e.g. one with retries or tracing. |

## Testing

Unit tests use a `fetch` that records each request and answers with a canned response, and one test uses the real `fetch` against a local HTTP server. The server's tests use this client against the real service.
