---
# @manual-start frontmatter
description: Middleware around fetch for Node.js, in the shape of Go's RoundTripper. Auth, retries and rate limits are each a plugin, with a bearer token renewed once for a burst of refusals, and Ky retrying only what's safe to send again.
# @manual-end frontmatter
---

<!-- @generated-signature v1:04c1e99501b746eb5fd2f4d600eb2dfb Generated from demos/fetch-middleware/README.md by docs/scripts/populate-docs.mjs (nx run @leyman/docs:populate-docs). Edit demos/fetch-middleware/README.md instead, and the description only here. -->

# Fetch middleware

<ProjectHeader />

Middleware around fetch, shared by the demos: each concern of sending a request (auth, retries, limits) is a plugin, with Ky as the sender.

Sending a request well takes more than `fetch`. A request that fails for a moment should be sent again, but only if sending it twice is safe. A token that expired should be renewed once, not by every request that notices at the same time. A server fronting many users shouldn't flood the API behind it. Each of these is a concern of its own, and an application should be able to choose which ones it has, and bring its own.

Go has a shape for this already: an `http.RoundTripper` wraps another, so each concern is one wrapper. `fetch` can play the same part. A middleware takes the next way to send a request and returns its own:

```ts
type Send = (request: Request) => Promise<Response>;
type Middleware = (next: Send) => Send;
```

This demo is that shape and the two pieces worth sharing, with [Ky](https://github.com/sindresorhus/ky) as the sender. It's a worked example the demos share rather than a package, and isn't published.

## Example

An API client's `fetch`: the token renewed once when the API refuses it, and Ky retrying what's safe to send again.

```ts
declare const session: { readonly accessToken: string };
declare const refresh: (refused: string) => Promise<{ readonly accessToken: string } | null>;
// ---cut---
import { bearer, compose, kySend } from '@leyman/demo-fetch-middleware';

const fetch = compose(
    [
        bearer({
            token: async () => session.accessToken,
            renew: async refused => (await refresh(refused))?.accessToken ?? null,
        }),
    ],
    kySend({
        timeout: 10_000,
        retry: { limit: 2, statusCodes: [429, 502, 503, 504], maxRetryAfter: 30_000, jitter: true },
    })
);
```

The result is a `fetch`, so it goes wherever one does, such as a generated client's `fetch` option.

## The pieces

### `compose(middlewares, send?)`

A `fetch` that sends each request through the middlewares in order, the first outermost, and finally through `send` (`fetch` itself by default). Each request becomes a `Request` first, so a middleware works on one type, whatever the caller passed.

A middleware owns the request it's given, body and all. One that sends it more than once sends clones until the last send.

### `bearer(credentials, options?)`

Sends each request with a bearer token (RFC 6750), and once more with a renewed token when the API refuses the first.

- `credentials.token()` gives the token to send, before each request: the place to renew one that has expired.
- `credentials.renew(refused)` gives a token to send instead, or `null` when there's none and the refusal stands.
- Every request refused the same token sends the token one `renew` gave, whether it was refused while that `renew` ran or after, so a burst of refusals renews once. Only the latest renewal is remembered: a request refused a token older than that renews for itself.
- A `renew` that throws or gives `null` isn't remembered, so the next refusal of that token calls it again.
- `options.refusedStatuses` are what count as a refusal (`401` by default).

Ky's own answer (a hook that refreshes on `401`) renews once per request instead.

### `kySend(options)`

Sends with Ky, as the last `Send`: Ky retries and times out as it's set up to, and the result is `fetch`'s, an error status included, for a client that reads error statuses itself.

- Only a request safe to send twice is retried: an idempotent method (RFC 9110 §9.2.2, plus `QUERY`), or one with an `Idempotency-Key`. A `POST` or `PATCH` without one is sent once, so `retry` takes no `methods` or `shouldRetry` of its own.
- A status in `retry.statusCodes` is retried by an `afterResponse` hook that returns `ky.retry()`. Once out of retries, the last response comes back exactly as the server sent it, body unread. `statusCodes` has no default: Ky's own list counts on Ky not retrying a `413` without a `Retry-After`, which `kySend` doesn't copy.
- When the status is in `retry.afterStatusCodes`, the wait is what `Retry-After` asks for (seconds or a date), cut to `retry.maxRetryAfter`, with no jitter, as Ky does. Otherwise, or when `Retry-After` can't be read, it's Ky's backoff. Ky also reads rate-limit headers like `RateLimit-Reset` when there's no `Retry-After`; `kySend` doesn't.
- A `beforeRetry` hook sees a `ForceRetryError` for a retried status, not an `HTTPError`.
- A network error rejects once out of retries. A timeout rejects unless `retry.retryOnTimeout` retries it, and `totalTimeout` rejects with a `TimeoutError` whenever it runs out, even with retries left. Aborting the request stops the wait between retries.

## What was learned

- The shape costs almost nothing: `compose` is ten lines, and needs no framework.
- [cockatiel](https://github.com/connor4312/cockatiel) was the first retrier tried. It needed a wrapper to honor `Retry-After`, its `maxAttempts` counts retries rather than sends, and its wait between retries doesn't stop when the request is aborted. Ky does all of that itself, so it replaced both the wrapper and the timeout middleware.
- Ky's hooks fit some concerns badly. A rate limiter has to take a slot before every attempt and give it back after every outcome, which no pair of hooks covers. As a middleware it's one `await`.
- Where a middleware goes decides what it counts. Composed in front of `kySend`, it sees a whole call, retries and their delays included: right for a token, which a retry should reuse. Composed into Ky's own `fetch` (`kySend({ fetch: compose([...]) })`), it sees each attempt: right for a concurrency cap, so a request waiting out a retry's delay holds no slot. The MCP demo's limiter goes there.
- Ky retries only statuses it throws for, and once it throws it has read the body, so the response is gone. Rebuilding one from `HTTPError.data` loses a JSON string's quotes, an unparsable body, and big integers. So `kySend` never lets Ky throw for a status, and asks for retries from an `afterResponse` hook. A forced retry skips Ky's `Retry-After` handling, so the hook reads it itself.
- Ky's `retry.methods` decides by method alone, but `shouldRetry` sees the request (each network error or timeout carries it). So `kySend` lets every method through `methods` and decides per request in `shouldRetry`.

## Not covered

- Logging as a middleware.
- Streaming request bodies with retries: Ky buffers a body to send it again.
