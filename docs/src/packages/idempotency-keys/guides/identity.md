---
description: What makes two requests the same key (scope, operation and the Idempotency-Key header) and what a reused key must match (the fingerprint).
---

# Keys, scope and operation

Each key has an identity, and each request has a fingerprint. The identity says which record a request claims, and the fingerprint says whether it is the same request as the one that claimed it first.

## Identity

The identity is `(scope, operation, key)`:

| Part        | Given by   | What it is                                                                                                 |
| ----------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| `scope`     | You        | Who is calling, such as a user or tenant id. Required, not empty. One caller's keys never touch another's. |
| `operation` | You        | Optional: any non-empty name, such as an OpenAPI `operationId` or a route name.                            |
| `key`       | The client | The `Idempotency-Key` header.                                                                              |

With an `operation`, the same key on another operation is another key. Without one, a key is one key across everything the scope calls, so reusing it on another endpoint is a `422`. Pick one approach and keep it, because changing it changes every identity, so a retry across the change runs again.

```ts
import type { IdempotencyKeys } from 'idempotency-keys';

declare const keys: IdempotencyKeys;
declare const request: Request;
declare const tenantId: string;
declare const run: (request: Request) => Promise<Response>;
// ---cut---
// A key from one tenant on createInvoice, apart from the same key on any other operation
await keys.handle(request, { scope: tenantId, operation: 'createInvoice' }, run);
```

Take the scope from authentication rather than from the request body, because the scope is what keeps one caller from replaying another's response.

## The header

The key is the `Idempotency-Key` header's value: 1 to 255 characters, each from `0x20` (space) to `0x7E`. A value in quotes is a Structured Field String ([RFC 9651](https://www.rfc-editor.org/rfc/rfc9651#section-3.3.3)), as the IETF draft writes it (`Idempotency-Key: "8e03978e-40d5-43e8-bc93-6894a57f9324"`), and the key is its content. Any other value is the key as it is, so a client sending a bare UUID works too.

A key that can't be read is a `400`. So is a repeated header, because an unquoted key can't hold a comma and a quoted one can't be followed by more, so the values joined by `, ` are never one key.

A request without the header runs as it would without the library, unless `required: true`, which makes it a `400`.

## Fingerprint

A reused key must match the request that first used it. Otherwise the request gets a `422` instead of the first request's response. `handle()` fingerprints:

- the method (`POST`, and so on);
- the path and query of `request.url` (`/notes?draft=1`; `/notes?` is `/notes`), without the origin or fragment;
- the headers named in `fingerprintHeaders`, in any case;
- the body.

No header is in the fingerprint unless you name it. Name the ones that change what the handler does, such as `Content-Type` when the handler accepts several, or `Accept-Language` when the response depends on it:

```ts
import type { IdempotencyStore } from 'idempotency-keys';

declare const store: IdempotencyStore;
// ---cut---
import { IdempotencyKeys } from 'idempotency-keys';

const keys = new IdempotencyKeys({ store, fingerprintHeaders: ['content-type'] });
```

A named header's value must be Latin-1 (every character at most `U+00FF`), as HTTP allows, and anything else throws `IdempotencyKeysHeaderValueError`.

A mismatch is answered at once, without waiting on the request that holds the key, and without disturbing it.

The body is the raw bytes, so two JSON bodies that differ only in key order or whitespace are two requests. Clients retrying a request should send the same bytes again.
