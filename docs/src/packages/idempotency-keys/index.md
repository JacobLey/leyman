---
description: Server-side support for the Idempotency-Key header, so clients can safely retry a POST. Works across instances, on Postgres or Valkey, in TypeScript and Go.
---

# idempotency-keys

<ProjectHeader />

Server-side support for the Idempotency-Key header, so clients can safely retry a POST. Works across instances, on Postgres or Valkey, in TypeScript and Go.

```ts
import type { Pool } from 'pg';

declare const pool: Pool;
declare const userId: (request: Request) => Promise<string>;
declare const createNote: (request: Request) => Promise<Response>;
// ---cut---
import { IdempotencyKeys, PostgresStore } from 'idempotency-keys';

const keys = new IdempotencyKeys({ store: new PostgresStore({ client: pool }) });

// Any handler over fetch's Request and Response: Hono, Bun, Deno, Next.js route handlers...
export const POST = async (request: Request): Promise<Response> =>
    keys.handle(request, { scope: await userId(request), operation: 'createNote' }, createNote);
```

**[Get started →](/packages/idempotency-keys/getting-started)**

## Features

- One run per key, across every instance: a duplicate of a running request waits for its response (or gets a `409`), and a later one gets the stored response back, marked `Idempotent-Replayed: true`.
- A reused key on a different request is a `422`, never a replay of another request's response: the method, path, query, body and the headers you name must match.
- A crashed request holds up no one for long: its claim is a lease, and once it runs out a waiting request takes over. See [Which responses are stored](/packages/idempotency-keys/guides/responses).
- Postgres or Valkey, with no client dependency: pass your own `pg` pool or ioredis connection. Postgres is strict and durable; Valkey is lax, as a failover can forget a key. See [Stores](/packages/idempotency-keys/guides/stores).
- Notifications through Postgres `LISTEN` or Valkey pub/sub wake a waiting request as soon as the running one ends, on any instance. They only make waiting faster: without them, waiting requests poll. See [Notifiers](/packages/idempotency-keys/guides/notifiers).
- TypeScript and Go: both follow one [specification](/packages/idempotency-keys/reference/specification), so servers in either language on the same store serve one set of keys. See [Go](/packages/idempotency-keys/guides/go).

Status codes follow the IETF draft [The Idempotency-Key HTTP Header Field](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07) (draft 07). It doesn't fit a write that must never run twice whatever happens to the store: use the Postgres store for payments, not Valkey.

## Compared to

The other npm packages for `Idempotency-Key` that we looked at, as their READMEs describe them (versions as of November 2026). We wrote idempotency-keys, so read their docs too.

|                                     | idempotency-keys                                                      | [@node-idempotency/core](https://github.com/mahendraHegde/node-idempotency) 1.1.0 | [hono-idempotency](https://github.com/paveg/hono-idempotency) 0.9.1 | [express-idempotency](https://github.com/VilledeMontreal/express-idempotency) 2.1.0 |
| ----------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Frameworks                          | Any over `fetch`'s `Request`, others through `begin()`, Go `net/http` | Express, Fastify, NestJS, others through the core                                 | Hono                                                                | Express                                                                             |
| Stores                              | Postgres, Valkey or Redis                                             | Memory, Redis, Postgres                                                           | Memory, Redis, Cloudflare KV, D1, Durable Objects                   | Memory, MongoDB (separate adapter)                                                  |
| A duplicate while the first runs    | Waits up to 10 s (woken early by a notifier), then `409`              | Error at once, or polls when `inProgressStrategy.wait` is set                     | `409`                                                               | `409`                                                                               |
| A key reused on a different request | `422`: method, path, query, body and named headers                    | Error: the body                                                                   | `422`: method, path and body                                        | `417`: method, URL, query and body                                                  |
| Responses stored                    | All but a `429`, by a policy you can change                           | Responses and errors                                                              | `2xx` only                                                          | `2xx` by default, configurable                                                      |
| A request that crashed mid-run      | Taken over once its lease (60 s) runs out                             | Not documented                                                                    | Not documented                                                      | Taken over after `processingTimeout`, if set; otherwise `409` until the key expires |
| Replay header                       | `Idempotent-Replayed: true`                                           | Not documented                                                                    | `Idempotency-Replayed: true`                                        | Not documented                                                                      |
| Other languages on the same keys    | Go                                                                    | None documented                                                                   | None documented                                                     | None documented                                                                     |

The defaults are close to how [Stripe's API](https://docs.stripe.com/api/idempotent_requests) (v1) describes its own keys: up to 255 characters, forgotten after 24 hours (Stripe: at least 24 hours), a reused key checked against the first request's parameters, and a `500` replayed like any other response once the handler has started. As at Stripe, a request answered before it runs (a `409`, or a key that can't be read) stores nothing, so it can be retried.

## Related

<ProjectRelated />
