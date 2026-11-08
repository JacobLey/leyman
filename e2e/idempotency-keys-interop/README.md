# e2e-idempotency-keys-interop

Drives a TypeScript server and a Go server on idempotency-keys against each other, on one store and notifier, and checks they serve one set of keys.

The [specification](../../tools/idempotency-keys/SPEC.md) promises that servers in both languages, on the same store and notifier, serve one set of keys as if they were one server. The test vectors check each implementation's hashes and store operations on their own; this package checks the promise end to end, with both servers running as child processes and every request crossing from one to the other.

The servers are the same small app in each language: the TypeScript one, [`test/server/server.ts`](./test/server/server.ts), on `handle()`, and the Go one, [`e2e/idempotency-keys-interop-go`](../idempotency-keys-interop-go/), on `Keys.Middleware`. Both read the same environment variables (store, notifier, table, key prefix, channel, lease and wait), answer every path and method with `{"server":"<language>","run":<n>}` (`n` counting the handler's runs for the `x-scope` header's scope), and sleep and answer with the delay and status the `x-delay-ms` and `x-status` headers ask for. Neither header is part of the fingerprint, so a retry of the same request can ask for another status.

## Matrix

Every case runs on each combination, in both directions (TypeScript first then Go, and Go first then TypeScript):

| Store    | Notifiers              |
| -------- | ---------------------- |
| Postgres | Postgres, Valkey, none |
| Valkey   | Valkey, none           |

Each test gets a Postgres database of its own (from [`pg-dolly`](../../tools/pg-dolly/), holding the library's `createTableSql()` table), a Valkey key prefix and channel of its own, and two new servers.

## Cases

- **Replay**: one server runs a request, and the other replays it, with the first server's body and `Idempotent-Replayed: true`, without running the handler.
- **Wait and wake**: a duplicate sent to the other server while the first runs waits, and gets the same response. Both implementations poll at 0, 50, 150, 350 and 750 ms after a request arrives, and the first request completes about 450 ms after the duplicate arrives, so polling alone would answer some 300 ms after it. With a notifier, the duplicate must answer within 150 ms of the first request, which only a notification can do; without one, it answers by polling.
- **Conflict**: the duplicate's wait (1 s) runs out while the first still holds its lease (1.5 s): `409`.
- **Mismatch**: the key with another body on the other server: `422`.
- **Lease takeover**: the first server is killed (`SIGKILL`) mid-request, and once the lease runs out the other server runs the request.
- **Release**: a `429` on one server frees the key, and a retry on the other runs again.
- **Request targets**: a target sent raw to one server and normalized to the other is one request (`/a/../notes` and `/notes`, a backslash, `%2e` dot segments, an absolute-form target, non-ASCII paths), picked from the test vectors, while `/notes/%61` and `/notes/a` are two (`422`).

Requests go over a raw socket rather than `fetch`, which would normalize the target before sending it. Node's HTTP parser rejects a raw non-ASCII byte in the target with a `400` before the server sees it, while Go's accepts it: the raw form of those targets only goes to the Go server, and the test checks the TypeScript server's `400`.

## Running

```sh
nx run @leyman/e2e-idempotency-keys-interop:test
```

It needs the `postgres` and `valkey` sidecars, and Go, as `test` builds the Go server first (`go build` into the gitignored `bin/`, in a root `before` hook). It runs in about 45 seconds, most of it waiting on leases and waits.

It is not published, and has no source of its own: only tests and the server they run.
