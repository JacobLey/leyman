---
description: Use begin() to handle Idempotency-Key in a framework without fetch's Request and Response, hashing the request with computeFingerprint() and ending the attempt yourself.
---

# Other frameworks

`handle()` takes `fetch`'s `Request` and returns a `Response`, which Hono, Bun, Deno and Next.js route handlers use. For any other framework, `begin()` is the same flow in parts: you read the key, hash the request, and send the response.

## The flow

```ts
import type { IdempotencyKeys, StoredResponse } from 'idempotency-keys';

declare const keys: IdempotencyKeys;
declare const createNote: () => Promise<StoredResponse>;
declare const badRequest400: () => StoredResponse;
declare const conflict409: () => StoredResponse;
declare const unprocessable422: () => StoredResponse;
// ---cut---
import { computeFingerprint, IdempotencyKeyHeaderError, parseIdempotencyKey } from 'idempotency-keys';

interface RawRequest {
    readonly method: string;
    readonly pathAndQuery: string;
    readonly headers: readonly (readonly [string, string])[];
    readonly body: Uint8Array;
}

export const handleCreateNote = async (
    request: RawRequest,
    scope: string
): Promise<StoredResponse> => {
    const values = request.headers
        .filter(([name]) => name.toLowerCase() === 'idempotency-key')
        .map(([, value]) => value);
    let key: string | null;
    try {
        key = parseIdempotencyKey(values);
    } catch (error) {
        if (error instanceof IdempotencyKeyHeaderError) {
            return badRequest400();
        }
        throw error;
    }
    if (key === null) {
        // No key: runs as it would without the library
        return createNote();
    }

    const fingerprint = await computeFingerprint({
        method: request.method,
        target: request.pathAndQuery,
        headers: request.headers,
        named: [],
        body: request.body,
    });
    const result = await keys.begin({ scope, operation: 'createNote', key, fingerprint });

    switch (result.outcome) {
        case 'run': {
            const response = await createNote();
            await result.attempt.respond(response);
            return response;
        }
        case 'replay':
            // Send it with the header Idempotent-Replayed: true
            return result.response;
        case 'conflict':
            return conflict409();
        case 'mismatch':
            return unprocessable422();
    }
};
```

## Reading the key

`parseIdempotencyKey(values)` takes the header's values, one per header received, or already joined by `, `. It returns the key, or `null` when there is no header, and throws `IdempotencyKeyHeaderError` for a key that can't be read or a repeated header, which you answer with a `400`.

## Hashing the request

`computeFingerprint()` takes:

| Field     | What                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `method`  | As received. `DELETE`, `GET`, `HEAD`, `OPTIONS`, `POST` and `PUT` are upper-cased, as `fetch` does; other methods are case-sensitive. |
| `target`  | The path and query.                                                                                                                   |
| `headers` | The request's headers, as `[name, value]` pairs in the order received, or a `Headers`.                                                |
| `named`   | The names of the headers that are part of the fingerprint, in any case. `[]` for none.                                                |
| `body`    | The raw body, as bytes, or a string as UTF-8. Empty for a request without one.                                                        |

To share keys with `handle()`, or with a Go server, the target must be hashed as a WHATWG URL serializes it, the way `Request.url` holds it. That makes `/a/../notes` the same as `/notes`, and `/café` the same as `/caf%C3%A9`. Build it from the raw target with `URL`, as `handle()` does:

```ts
declare const rawTarget: string;
// ---cut---
const { pathname, search } = new URL(`http://host${rawTarget}`);
const pathAndQuery = pathname + search;
```

That joins the origin and raw target as strings instead of resolving the target as a relative URL, so `//notes` stays a path. An absolute-form target (`http://host/notes`) is parsed on its own instead. See the [specification](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md#encoding) for the details.

Use the raw body bytes. A body parsed and serialized again may differ from the bytes the client sent.

## Ending the attempt

With `outcome: 'run'`, the request holds the key. End it with one of:

- `attempt.respond({ status, headers, body })`, which applies the respond policy and resolves to `'stored'`, `'released'`, `'lost'` (its lease ran out and another request took over, so nothing changed) or `'refused'` (a response a replay couldn't send; the store isn't touched and the attempt still holds the key, so respond again or release it).
- `attempt.release()`, which frees the key whatever the response, and resolves to whether it did.

An attempt that never ends (its server crashed, or the handler threw) holds the key until its lease runs out, then the next request with the key runs.

A replay's `response` is the stored `{ status, headers, body }`, with `headers` as `[name, value]` pairs (repeated names kept) and `body` as bytes. Send it with `Idempotent-Replayed: true`. To answer `409` and `422` as `handle()` does, `problemResponse('conflict')` and `problemResponse('mismatch')` build its RFC 9457 problem documents.
