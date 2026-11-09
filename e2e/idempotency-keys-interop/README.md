# e2e-idempotency-keys-interop

Drives a TypeScript server and a Go server on idempotency-keys against each other, on one store and notifier, and checks they serve one set of keys.

The [specification](../../tools/idempotency-keys/SPEC.md) says that servers in both languages, on the same store and notifier, serve one set of keys as if they were one server. The test vectors check each implementation's hashes and store operations separately. This package checks the two together, end to end: it runs both servers as child processes and sends every request across from one to the other.

The servers are the same small app in each language: the TypeScript one, [`test/server/server.ts`](./test/server/server.ts), on `handle()`, and the Go one, [`e2e/idempotency-keys-interop-go`](../idempotency-keys-interop-go/), on `Keys.Middleware`. Both read the same environment variables (store, notifier, table, key prefix, channel, lease and wait). They answer every path and method with `{"server":"<language>","run":<n>}` (`n` counting the handler's runs for the `x-scope` header's scope), after sleeping for `x-delay-ms` and with the status in `x-status`, when a request sends those headers. Neither header is part of the fingerprint, so a retry of the same request can ask for another status.

## Matrix

Every case runs on each combination, in both directions (TypeScript first then Go, and Go first then TypeScript):

| Store    | Notifiers              |
| -------- | ---------------------- |
| Postgres | Postgres, Valkey, none |
| Valkey   | Valkey, none           |

Each test gets a Postgres database of its own (from [`pg-dolly`](../../tools/pg-dolly/), holding the library's `createTableSql()` table), a Valkey key prefix and channel of its own, and two new servers.

## Cases

- One server runs a request, and the other replays it with the first server's body and `Idempotent-Replayed: true`, without running the handler.
- A duplicate sent to the other server while the first request runs waits, and gets the same response. Both implementations poll at 0, 50, 150, 350 and 750 ms after a request arrives, and the first request completes about 450 ms after the duplicate arrives, so polling alone would answer some 300 ms after it. With a notifier, the duplicate must answer within 150 ms of the first request, which only a notification can do. Without one, it answers by polling.
- A duplicate whose wait (1 s) runs out while the first request still holds its lease (1.5 s) gets a `409`.
- The same key with another body, sent to the other server, gets a `422`.
- When the first server is killed (`SIGKILL`) mid-request, the other server runs the request once the lease runs out.
- A `429` on one server frees the key, and a retry on the other runs again.
- A target sent raw to one server and normalized to the other is one request (`/a/../notes` and `/notes`, a backslash, `%2e` dot segments, an absolute-form target, non-ASCII paths), picked from the test vectors, while `/notes/%61` and `/notes/a` are two (`422`).

Requests go over a raw socket rather than `fetch`, which would normalize the target before sending it. Node's HTTP parser rejects a raw non-ASCII byte in the target with a `400` before the server sees it, while Go's accepts it. So the raw form of those targets only goes to the Go server, and the test checks that the TypeScript server answers `400`.

## Running

```sh
nx run @leyman/e2e-idempotency-keys-interop:test
```

It needs the `postgres` and `valkey` sidecars, and Go, as `test` builds the Go server first (`go build` into the gitignored `bin/`, in a root `before` hook). It runs in about 45 seconds, most of it waiting on leases and waits.

It is not published, and has no source of its own, only tests and the server they run.
