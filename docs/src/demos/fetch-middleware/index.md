---
# @manual-start frontmatter
description: Middleware around fetch for Node.js, in the shape of Go's RoundTripper. Auth, retries and rate limits are each a plugin, with a bearer token renewed once for a burst of refusals, and Ky retrying only what's safe to send again.
# @manual-end frontmatter
---

<!-- @generated-signature v1:8b91a440c677145f37ba8e31d636b656 Generated from demos/fetch-middleware/README.md by docs/scripts/populate-docs.mjs (nx run @leyman/docs:populate-files). Edit demos/fetch-middleware/README.md instead, and the description only here. -->

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

The notes CLI's API client: the token renewed once when the API refuses it, and Ky retrying what's safe to send again.

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

The result is a `fetch`, so it goes wherever one does (here, `NotesClient`'s `fetch` option).

## The pieces

### `compose(middlewares, send?)`

A `fetch` that sends each request through the middlewares in order, the first outermost, and finally through `send` (`fetch` itself by default). Each request becomes a `Request` first, so a middleware works on one type, whatever the caller passed.

A middleware owns the request it's given, body and all. One that sends it more than once sends clones until the last send.

### `bearer(credentials, options?)`

Sends each request with a bearer token (RFC 6750), and once more with a renewed token when the API refuses the first.

- `credentials.token()` gives the token to send, before each request: the place to renew one that has expired.
- `credentials.renew(refused)` gives a token to send instead, or `null` when there's none and the refusal stands.
- Requests refused the same token at the same time wait for the same `renew`, so a burst of refusals renews once.
- `options.refusedStatuses` are what count as a refusal (`401` by default).

Ky's own answer (a hook that refreshes on `401`) renews once per request instead.

### `kySend(options)`

Sends with Ky, as the last `Send`: Ky retries and times out as it's set up to, and the result is `fetch`'s, an error status included, for a client that reads error statuses itself.

- Only a request safe to send twice is retried: an idempotent method (RFC 9110 §9.2.2), or one with an `Idempotency-Key`. A `POST` without one is sent once.
- `retry.statusCodes` is required, since it's also which statuses Ky throws for: Ky retries only those. Once Ky is out of retries, the status comes back as a response.
- Ky has already read that response's body, so it's rebuilt from what Ky read: the same JSON or text, or none when Ky couldn't read it.
- A `Retry-After` longer than `retry.maxRetryAfter` is cut to it, as Ky does, rather than given up on.

## What was learned

- The shape costs almost nothing: `compose` is ten lines, and needs no framework.
- [cockatiel](https://github.com/connor4312/cockatiel) was the first retrier tried. It needed a wrapper to honor `Retry-After`, its `maxAttempts` counts retries rather than sends, and its wait between retries doesn't stop when the request is aborted. Ky does all of that itself, so it replaced both the wrapper and the timeout middleware.
- Ky's hooks fit some concerns badly. A rate limiter has to take a slot before every attempt and give it back after every outcome, which no pair of hooks covers. As a middleware it's one `await`.
- Where a middleware goes decides what it counts. Composed in front of `kySend`, it sees a whole call, retries and their delays included: right for a token, which a retry should reuse. Composed into Ky's own `fetch` (`kySend({ fetch: compose([...]) })`), it sees each attempt: right for a concurrency cap, so a request waiting out a retry's delay holds no slot. The MCP demo's limiter goes there.
- Ky retries only statuses it throws for, so `kySend` turns the last `HTTPError` back into a response. And Ky decides by method alone whether a request may be retried, so `kySend` turns retries off for a request that isn't safe to send twice. One maintainer has proposed letting an `Idempotency-Key` allow retries ([ky#692](https://github.com/sindresorhus/ky/issues/692)), which would make that part unnecessary.

## Not covered

- Logging as a middleware.
- Streaming request bodies with retries: Ky buffers a body to send it again.
