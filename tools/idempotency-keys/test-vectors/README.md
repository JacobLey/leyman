# idempotency-keys-test-vectors

Test vectors shared by every idempotency-keys implementation.

Each implementation runs them in its own tests, so every one is checked against the
[specification](../SPEC.md) itself rather than against another implementation.

```ts
import testVectors from '@leyman/idempotency-keys-test-vectors/test-vectors.json' with { type: 'json' };
```

The Go implementation is a released module, so it can't depend on this unpublished package. Its tests read
[`data/test-vectors.json`](./data/test-vectors.json) by relative path instead, which works for other languages too.

## Format

Strings are UTF-8, and bodies are strings, except that fingerprint header values are hashed one byte per character (`U+0000` to `U+00FF`), as `fetch` gives them.

- `defaults`: the default options.
- `keys`: the `Idempotency-Key` header values a request has (`header`, one entry per header), and the `key` read from
  them, `null` for no key, or `error: true` for a `400`.
- `identities`: `scope`, `operation` (left out when absent) and `key`, and their `identity`.
- `targets`: a raw request target (`raw`, as on the request line) and the `target` hashed for it: the origin and `raw`
  concatenated (or `raw` alone, when it starts with `http:` or `https:` in any case), parsed as a WHATWG URL, then its
  path and non-empty query. Each `target` is what Node.js's `URL` gives.
- `fingerprints`: a request's `method`, `target`, `headers` (`[name, value]` pairs as received) and `body`, the header
  names the server names (`named`, as the server wrote them), and the request's `fingerprint`.
- `valkeyScripts`: the Lua scripts of the Valkey store, sent byte for byte.
- `scenarios`: sequences of requests, run against every store with each scenario's `options` over `defaults`, and the
  default response policy. Each uses a fresh store (or fresh keys in it).

A scenario names its `requests` (as in `identities` and `fingerprints`, with `named` empty) and runs its `steps` in
order. A step names an attempt, which later steps refer to:

| Step                                                | Does                                                       | Expects                                                                                                                                                                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ "begin": name, "request": r, "expect": e }`      | Starts request `r` and awaits its outcome.                 | `e` is `run`, `replay` (with `response`), `conflict` (`409`) or `mismatch` (`422`).                                                                                                                                     |
| `{ "start": name, "request": r }`                   | Starts request `r` without awaiting it.                    |                                                                                                                                                                                                                         |
| `{ "await": name, "expect": e }`                    | Awaits a started request.                                  | As for `begin`.                                                                                                                                                                                                         |
| `{ "respond": name, "response": res, "expect": e }` | Ends a running attempt with `res`, by the response policy. | `e` is `stored`, `released`, `lost` (its token was gone, so nothing changed), or `error` (a response a replay couldn't send: ending the attempt raises an error, nothing changed, and the attempt still holds the key). |
| `{ "release": name, "expect": b }`                  | Releases a running attempt.                                | Whether it released.                                                                                                                                                                                                    |
| `{ "sleep": ms }`                                   | Waits.                                                     |                                                                                                                                                                                                                         |

A response is `status`, `headers` (`[name, value]` pairs) and `body`. A replay returns the stored response exactly:
the same headers in the same order, repeated names kept.
