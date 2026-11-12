---
description: Server-side support for the Idempotency-Key header, so clients can safely retry a POST. Works across instances on a shared store, with Postgres and Valkey built in, in TypeScript and Go.
---

# idempotency-keys

<ProjectHeader />

Server-side support for the Idempotency-Key header, so clients can safely retry a POST. Works across instances on a shared store, with Postgres and Valkey built in, in TypeScript and Go.

A client whose connection drops while it sends a `POST` can't tell whether the server got the request, and a retry might do the work twice. The `Idempotency-Key` header, popularized by Stripe and now an [IETF draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07), lets the client send the same unique key with every attempt, so the server can answer a retry with the response it already gave.

idempotency-keys handles the header on the server. `handle()` runs the first request with a key and stores its response in a store every instance shares: Postgres or Valkey, or one you write. Later requests with that key get the stored response instead of running the handler again, whichever instance they reach.

```ts
import type { Pool } from 'pg';

declare const pool: Pool;
declare const userId: (request: Request) => Promise<string>;
declare const createNote: (request: Request) => Promise<Response>;
// ---cut---
import { IdempotencyKeys } from 'idempotency-keys';
import { PostgresStore } from 'idempotency-keys/postgres';

const keys = new IdempotencyKeys({ store: new PostgresStore({ client: pool }) });

// Any handler over fetch's Request and Response: Hono, Bun, Deno, Next.js route handlers...
export const POST = async (request: Request): Promise<Response> =>
    keys.handle(request, { scope: await userId(request), operation: 'createNote' }, createNote);
```

**[Get started →](/packages/idempotency-keys/getting-started)**

## Features

- A duplicate that arrives while the first request is still running waits for its response, and gets a `409` if the wait runs out. Duplicates after that get the stored response, marked `Idempotent-Replayed: true`.
- A key that comes back on a different request gets a `422` instead of the first request's response. The method, path, query, body and any headers you name all have to match.
- A request's claim on its key is a lease, so if its server crashes, a waiting request takes over once the lease runs out. See [Which responses are stored](/packages/idempotency-keys/guides/responses).
- You pass your own `pg` pool or ioredis connection, so the package has no client dependency. Postgres keeps keys durably, while Valkey can forget one after a failover. Any other database works through a store you write to a short contract. See [Stores](/packages/idempotency-keys/guides/stores).
- Notifications through Postgres `LISTEN` or Valkey pub/sub wake a waiting request as soon as the running one ends, on any instance. Waiting requests poll the store either way, so a notifier only makes waiting faster. See [Notifiers](/packages/idempotency-keys/guides/notifiers).
- The TypeScript and Go implementations follow one [specification](/packages/idempotency-keys/reference/specification), so servers in either language can share a store and its keys. See [Go](/packages/idempotency-keys/guides/go).

Status codes follow the IETF draft [The Idempotency-Key HTTP Header Field](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07) (draft 07). For payments, or any write that must not run twice whatever happens to the store, use the Postgres store rather than Valkey.

## Compared to

The other npm packages for `Idempotency-Key` that we looked at, as their READMEs describe them (versions as of November 2026). We wrote idempotency-keys, so read their docs too.

|                                     | idempotency-keys                                                      | [@node-idempotency/core](https://github.com/mahendraHegde/node-idempotency) 1.1.0 | [hono-idempotency](https://github.com/paveg/hono-idempotency) 0.9.1 | [express-idempotency](https://github.com/VilledeMontreal/express-idempotency) 2.1.0 |
| ----------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Frameworks                          | Any over `fetch`'s `Request`, others through `begin()`, Go `net/http` | Express, Fastify, NestJS, others through the core                                 | Hono                                                                | Express                                                                             |
| Stores                              | Postgres, Valkey or Redis, or your own                                | Memory, Redis, Postgres                                                           | Memory, Redis, Cloudflare KV, D1, Durable Objects                   | Memory, MongoDB (separate adapter)                                                  |
| A duplicate while the first runs    | Waits up to 10 s (woken early by a notifier), then `409`              | Error at once, or polls when `inProgressStrategy.wait` is set                     | `409`                                                               | `409`                                                                               |
| A key reused on a different request | `422`: method, path, query, body and named headers                    | Error: the body                                                                   | `422`: method, path and body                                        | `417`: method, URL, query and body                                                  |
| Responses stored                    | All but a `429`, by a policy you can change                           | Responses and errors                                                              | `2xx` only                                                          | `2xx` by default, configurable                                                      |
| A request that crashed mid-run      | Taken over once its lease (60 s) runs out                             | Not documented                                                                    | Not documented                                                      | Taken over after `processingTimeout`, if set; otherwise `409` until the key expires |
| Replay header                       | `Idempotent-Replayed: true`                                           | Not documented                                                                    | `Idempotency-Replayed: true`                                        | Not documented                                                                      |
| Other languages on the same keys    | Go                                                                    | None documented                                                                   | None documented                                                     | None documented                                                                     |

The defaults are close to how [Stripe's API](https://docs.stripe.com/api/idempotent_requests) (v1) describes its own keys: up to 255 characters, forgotten after 24 hours (Stripe: at least 24 hours), a reused key checked against the first request's parameters, and a `500` replayed like any other response once the handler has started. As at Stripe, a request answered before it runs (a `409`, or a key that can't be read) stores nothing, so it can be retried.

## Related

<ProjectRelated />
