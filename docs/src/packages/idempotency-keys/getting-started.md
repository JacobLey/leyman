---
description: Install idempotency-keys, create its Postgres table or point it at Valkey, then wrap a handler with handle().
---

# Getting started

## Install

::: code-group

```sh [npm]
npm i idempotency-keys
```

```sh [pnpm]
pnpm add idempotency-keys
```

```sh [yarn]
yarn add idempotency-keys
```

:::

::: tip
idempotency-keys is ESM only, for Node.js 22.12 or later. It has no dependencies: bring your own Postgres or Valkey client. The built-in adapters are imported from `idempotency-keys/postgres` and `idempotency-keys/valkey`, and everything else from `idempotency-keys`. The core needs only `fetch`'s `Request` and `Response` and WebCrypto; the Valkey adapters also import `node:buffer`, which Bun, Deno and Workers (`nodejs_compat`) provide.
:::

## Create the table

The Postgres store keeps every key in one table. Create it once, in a migration, with the statement `createTableSql()` returns:

```ts
import pg from 'pg';
import { createTableSql } from 'idempotency-keys/postgres';

declare const databaseUrl: string;
// ---cut---
const pool = new pg.Pool({ connectionString: databaseUrl });
await pool.query(createTableSql());
```

`createTableSql('my_keys')` names the table something else; pass the same name to the store. The statement is the one in the [specification](/packages/idempotency-keys/reference/specification#what-is-stored), so it can be copied into a migration tool's SQL file as it is.

Using Valkey instead? Skip this step: see [Stores](/packages/idempotency-keys/guides/stores#valkey) for its connection. Another database? See [Writing a store](/packages/idempotency-keys/guides/writing-a-store).

## Handle a request

Create one `IdempotencyKeys` per process, on the store, and pass each request through `handle()`:

```ts
import type { Pool } from 'pg';

declare const pool: Pool;
declare const userId: (request: Request) => Promise<string>;
declare const createNote: (request: Request) => Promise<Response>;
// ---cut---
import { IdempotencyKeys } from 'idempotency-keys';
import { PostgresStore } from 'idempotency-keys/postgres';

const keys = new IdempotencyKeys({ store: new PostgresStore({ client: pool }) });

export const POST = async (request: Request): Promise<Response> =>
    keys.handle(
        request,
        // Who is calling, and which operation this is
        { scope: await userId(request), operation: 'createNote' },
        createNote
    );
```

- A request without an `Idempotency-Key` header runs as usual. Pass `required: true` to answer it with a `400` instead.
- The first request with a key runs, and its response is stored.
- A retry gets the same status, headers and body back, with `Idempotent-Replayed: true`, without running the handler.
- A retry while the first still runs waits up to 10 seconds for it, then gets a `409`.
- The same key on a different request (another method, path, query or body) gets a `422`.

`scope` keeps callers apart: one user's key never touches another's. See [Keys, scope and operation](/packages/idempotency-keys/guides/identity).

`handle()` reads the whole body to fingerprint it, so put a body-size limit before it, and after authentication, which gives the scope.

## Hono

As middleware on the route, after authentication and a body-size limit:

```ts
import type { MiddlewareHandler } from 'hono';
import type { IdempotencyKeys } from 'idempotency-keys';

declare const keys: IdempotencyKeys;
declare const requireUser: MiddlewareHandler<{ Variables: { userId: string } }>;
declare const createNote: (body: unknown) => Promise<{ readonly id: string }>;
// ---cut---
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

const app = new Hono<{ Variables: { userId: string } }>();

app.post(
    '/notes',
    requireUser,
    bodyLimit({ maxSize: 64 * 1024 }),
    async (c, next) => {
        c.res = await keys.handle(
            c.req.raw,
            { scope: c.get('userId'), operation: 'createNote' },
            async () => {
                await next();
                return c.res;
            }
        );
    },
    async c => c.json(await createNote(await c.req.json()), 201)
);
```

The middleware assigns `c.res` rather than returning the response, because once the handler has set `c.res`, Hono ignores a middleware's return value ([compose.ts](https://github.com/honojs/hono/blob/v4.13.14/src/compose.ts#L67)), and would send the handler's response, whose body `handle()` already read to store it.

## Clean up expired keys

Postgres doesn't delete rows on its own. An expired row is overwritten by the next request with its key, so it does no harm, but the table grows. Call `deleteExpired()` from a scheduled job:

```ts
import type { PostgresStore } from 'idempotency-keys/postgres';

declare const store: PostgresStore;
// ---cut---
const deleted = await store.deleteExpired();
//    ^?
```

## Next steps

- [Stores](/packages/idempotency-keys/guides/stores): Postgres or Valkey, and when not to use Valkey.
- [Writing a store](/packages/idempotency-keys/guides/writing-a-store): keys in any other database.
- [Notifiers](/packages/idempotency-keys/guides/notifiers): wake a waiting duplicate as soon as the first request ends.
- [Which responses are stored](/packages/idempotency-keys/guides/responses): the default policy, releasing `5xx`, and crashed requests.
- [Other frameworks](/packages/idempotency-keys/guides/other-frameworks): `begin()`, for servers without `fetch`'s `Request`.
- [Go](/packages/idempotency-keys/guides/go): the same keys from a Go server.
- [API reference](/packages/idempotency-keys/reference/api): every option and error.
- [OpenAPI demo](/demos/openapi/): a Hono server whose spec says which operations take a key.
