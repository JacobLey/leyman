---
description: Which responses idempotency-keys stores and which free the key, the trade-off of releasing 5xx responses, what happens to a request that crashes, and what a replay sends.
---

# Which responses are stored

The request that holds a key ends its attempt with its response, in one of two ways:

- **complete**: the response is stored, and replayed to every later request with the key, until the key expires (`ttlMs`, 24 hours by default).
- **release**: the record is deleted, and the next request with the key runs.

Which one is up to `respondPolicy`, a function of the response.

## The default policy

`defaultRespondPolicy` stores every response except a `429` (Too Many Requests), which says nothing was done.

That includes a `5xx`. A handler that failed halfway may have written something, and running it again could write it twice, so a retry gets the same `500` back. So does a `4xx`: a retry of a request your handler rejected gets the same rejection back.

## Releasing 5xx responses

If your handlers are transactional, so a `5xx` means nothing was written, release them too, and a retry runs again:

```ts
import type { IdempotencyStore } from 'idempotency-keys';

declare const store: IdempotencyStore;
// ---cut---
import { IdempotencyKeys } from 'idempotency-keys';

const keys = new IdempotencyKeys({
    store,
    respondPolicy: ({ status }) => (status === 429 || status >= 500 ? 'release' : 'complete'),
});
```

A handler that may have partly written must not release: the retry would write again.

## Requests that never answer

A request that fails before it has a response (its server crashed, or the handler threw) neither completes nor releases. Its claim is a lease (`leaseMs`, 60 seconds by default): once it runs out, a waiting or later request with the same key and fingerprint takes over, and runs.

So set `leaseMs` above your slowest handler. There is no lease renewal: a request that runs longer than its lease can be taken over, and run twice. Its own caller still gets its response, but it isn't stored, since the request that took over will store its own.

`handle()` rejects with the handler's error, so your framework answers as it would without the library, and the key stays held until the lease runs out.

## When storing fails

A request that has a response but fails to store or release it (the store went away) still sends that response to its caller, who then has no reason to retry. `handle()` reports the failure to `onError`, and the key is held until its lease runs out.

A store that fails before the request runs fails the request: `handle()` rejects, and the handler never runs unprotected.

## What a replay sends

A replay has the stored status, headers and body, plus `Idempotent-Replayed: true`. The headers are kept in the order the response lists them (for `handle()`, the order of `fetch`'s `Headers`: sorted by name, repeated values joined, and repeated `Set-Cookie` kept), except those a server recomputes for every response it sends: `Connection`, `Content-Length`, `Keep-Alive` and `Transfer-Encoding`, and any `Idempotent-Replayed` of its own.

- `handle()` reads each response whole to store it, so a streamed response is buffered before it is sent.
- A response proxied from an upstream `fetch` carries the upstream's `Content-Encoding` with a body `fetch` already decoded. Strip that header in the handler, or a replay sends a decoded body labelled as encoded. `handle()` doesn't strip it, since a handler may really send an encoded body.
- A response a replay couldn't send isn't stored: a status outside 200 to 599, or a body on a `204`, `205` or `304`. `handle()` still sends it, and the key stays held until its lease runs out; with `begin()`, `respond()` resolves to `'refused'` without touching the store, and the attempt can respond again or release.
