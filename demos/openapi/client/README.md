# demo-openapi-client

A typed client for the OpenAPI demo's notes API, with types imported from the spec through a content mapper and routes read from openapi.json at runtime.

Part of the [OpenAPI demo](../README.md). It's a worked example, and isn't published.

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
    case 403:
    case 409:
    case 413:
    case 422:
        console.error(created.body.message); // `body` is an `ApiError`
        break;
}
```

## How it works

- The types come from the spec. `import type { Operations } from '@leyman/demo-openapi-spec/notes.openapi.yaml'` is typed by [genever-content-mapper](../../../apps/genever-content-mapper) as `tsc` runs, so no file is generated or committed. This needs TypeScript 7.1 (the package is on its beta, `catalog:typescript-next`). `tsconfig.json` registers the mapper for `.openapi.yaml` in `contentMappers`, `package.json` trusts it in `trustedContentMappers`, and the `tsc` targets run [trusted-tsc](../../../apps/trusted-tsc), which runs `tsc` with the mapper in Node's permission sandbox. `OperationInput<Id>` and `OperationResult<Id>` are mapped from genever's `Operations`. An operation's `path`, `query` and `header` parameters and its `body` only appear if it has them, and the result is a union of every documented `{ status, body }`, so a `switch` on `status` narrows `body`.
- The routes come from the spec too. The method and path of each operation, and the statuses it documents, are read from `openapi.json` when the module loads. Only the types are generated, so there's no generated runtime code to keep in sync.
- There's one generic `call` rather than a method per operation, so a new operation in the spec works as soon as the spec package is rebuilt.
- Header parameters are sent as headers. `createNote`'s optional `Idempotency-Key` makes a retry safe, as long as you send the same key with every retry of one note, and a new one for the next note:

  ```ts
  const key = crypto.randomUUID();
  const created = await client.call('createNote', {
      body: { title: 'Dolly', body: 'A sheep' },
      header: { 'Idempotency-Key': key },
  });
  ```

- The token can be a function, which is called before every request, so a token that expires can be refreshed rather than fixed at startup.
- A status the spec doesn't document (say, a 500) throws `NotesClientUnexpectedStatusError`, rather than being returned as if it matched a type.

## Options

| Option    | Default            | Description                                                                                        |
| --------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| `baseUrl` | —                  | Where the API is served. Paths in the spec are appended to its path.                               |
| `token`   | —                  | Bearer token, or a function returning one (called before each request). Every operation needs one. |
| `fetch`   | `globalThis.fetch` | Makes the requests, e.g. one with retries or tracing.                                              |

## Testing

Unit tests use a `fetch` that records each request and answers with a canned response, and one test uses the real `fetch` against a local HTTP server. The server's tests use this client against the real service.
