---
description: The Go implementation of idempotency-keys, with net/http middleware and the postgres and valkey packages, sharing keys with TypeScript servers on the same store.
---

# Go

idempotency-keys has a Go implementation, held to the same [test vectors](https://github.com/JacobLey/leyman/tree/main/tools/idempotency-keys/test-vectors) as the TypeScript package. It hashes, stores and announces keys as version 1.0 of the [specification](/packages/idempotency-keys/reference/specification) says, so a Go server and a TypeScript server on one store and notifier serve one set of keys, and either one replays, waits on, takes over or rejects the other's requests. It needs Go 1.25 or later.

```sh
go get github.com/JacobLey/leyman/tools/idempotency-keys/go@latest
```

| Package                                                         | What                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `github.com/JacobLey/leyman/tools/idempotency-keys/go`          | `New`, the middleware, `Begin`, the hashes. No dependencies.                           |
| `github.com/JacobLey/leyman/tools/idempotency-keys/go/postgres` | The Postgres store and notifier, on [pgx](https://github.com/jackc/pgx) v5.            |
| `github.com/JacobLey/leyman/tools/idempotency-keys/go/valkey`   | The Valkey store and notifier, on [valkey-go](https://github.com/valkey-io/valkey-go). |

The Postgres package uses pgx rather than `database/sql`, which can't `LISTEN`.

## net/http middleware

```go
import (
	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
	"github.com/JacobLey/leyman/tools/idempotency-keys/go/postgres"
)

pool, _ := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
// Once, in a migration
createTable, _ := postgres.CreateTableSQL(postgres.StoreOptions{})
pool.Exec(ctx, createTable)

store, _ := postgres.NewStore(pool, postgres.StoreOptions{})
listener, _ := pgx.Connect(ctx, os.Getenv("DATABASE_URL"))
notifier, _ := postgres.Listen(ctx, pool, listener, postgres.NotifierOptions{})

keys, _ := idempotencykeys.New(store, idempotencykeys.WithNotifier(notifier))

// After authentication and a body-size limit, as Handle reads the whole body to fingerprint it
mux.Handle("POST /notes", requireUser(limitBody(keys.Middleware(func(r *http.Request) idempotencykeys.HandleOptions {
	return idempotencykeys.HandleOptions{Scope: userID(r), Operation: "createNote"}
})(createNote))))
```

`keys.Middleware` takes a function giving each request's `HandleOptions` (its `Scope` from authentication that ran before it, its `Operation` from its route), and `keys.Handle(w, r, options, next)` is the same for one request. A request without an `Idempotency-Key` header runs as usual, unless `Required` is set.

Besides the statuses of the TypeScript package, `Handle` answers two of its own, as it can't reject the way `handle()` does:

| Status | When                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------- |
| `400`  | The `Idempotency-Key` header can't be read, or the operation requires one and the request has none. |
| `409`  | A request with the key is still running, and waiting for it ran out.                                |
| `422`  | The key was used on a different request.                                                            |
| `413`  | The body is over an `http.MaxBytesReader` limit set before it.                                      |
| `500`  | The store failed before the request ran, so it never runs unprotected.                              |

`WithProblem` changes the answer to the first three, and `WithErrorHandler` to the last two.

`next` writes to a recorder, so its response is buffered and only sent once it returns. That means it can't flush, hijack the connection, or send informational (`1xx`) responses.

## Valkey

```go
import valkeystore "github.com/JacobLey/leyman/tools/idempotency-keys/go/valkey"

client, _ := valkey.NewClient(valkey.ClientOption{InitAddress: []string{"valkey:6379"}})
notifier, _ := valkeystore.Listen(ctx, client, valkeystore.NotifierOptions{})
keys, _ := idempotencykeys.New(valkeystore.NewStore(client, valkeystore.StoreOptions{}), idempotencykeys.WithNotifier(notifier))
```

The store runs the specification's Lua scripts with `EVAL`, one key each, so it works on a cluster. The notifier subscribes on a connection it takes from the client (`Dedicate`) until `Close`. As in TypeScript, either notifier works with either store, and the [Stores](/packages/idempotency-keys/guides/stores#choosing) advice holds too. Valkey can forget a key on a failover, so use Postgres for payments.

## Options

`New(store, ...Option)` takes the TypeScript options as functions:

| TypeScript           | Go                                 |
| -------------------- | ---------------------------------- |
| `notifier`           | `WithNotifier(Notifier)`           |
| `ttlMs`              | `WithTTL(time.Duration)`, 24 h     |
| `leaseMs`            | `WithLease(time.Duration)`, 60 s   |
| `waitMs`             | `WithWait(time.Duration)`, 10 s    |
| `respondPolicy`      | `WithRespondPolicy(RespondPolicy)` |
| `fingerprintHeaders` | `WithFingerprintHeaders(names...)` |
| `problem`            | `WithProblem(ProblemWriter)`       |
| `onError`            | `WithOnError(func(err, identity))` |

Durations are whole milliseconds, as the specification's are. `New` returns an `*OptionError` (matching `ErrOption`) for one that isn't, for a nil store, or for a lease not below the TTL. An empty name (`Operation`, a table, prefix or channel) means none or the default.

To release `5xx` responses as well as `429`:

```go
keys, _ := idempotencykeys.New(store, idempotencykeys.WithRespondPolicy(func(r idempotencykeys.StoredResponse) idempotencykeys.Action {
	if r.Status == 429 || r.Status >= 500 {
		return idempotencykeys.ActionRelease
	}
	return idempotencykeys.ActionComplete
}))
```

## Without net/http

`keys.Begin(ctx, BeginParams)` is the flow of [`begin()`](/packages/idempotency-keys/guides/other-frameworks). Parse the key with `ParseKey` (`""` without a header), hash the request with `ComputeFingerprint`, passing the target through `RequestTarget(rawTarget)`, and switch on the result's `Outcome` (`OutcomeRun`, `OutcomeReplay`, `OutcomeConflict`, `OutcomeMismatch`). End a run with `Attempt.Respond(ctx, StoredResponse)` or `Attempt.Release(ctx)`.

`Respond` returns an error matching `ErrUnsendableResponse` for a response a replay couldn't send (a status outside 200 to 599, or a body on a `204`, `205` or `304`), before asking the policy or touching the store, so the attempt still holds the key to respond again or release. `Handle` sends such a response to its caller anyway and reports the error to `WithOnError`.

## Writing a store

`New` takes any `Store` (`Claim`, `Complete`, `Release`), so records can live somewhere other than Postgres or Valkey. A store written to the specification's [store contract](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md#the-store-contract) works with everything else: each operation is atomic for its identity, an expired record counts as absent, a takeover needs a matching fingerprint, `Complete` and `Release` check the token, and a failure is an error, never an answer. A store without a clock of its own may use the servers', with the lease covering the worst drift between them too. Its layout is its own, so a TypeScript server shares it only if it implements the same one.

The module's [`example_test.go`](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/go/example_test.go) has an in-memory store written to the contract, which the tests run through every scenario of the test vectors, and which the package docs show as the `Store` example.

## Differences from TypeScript

The two agree on every hash and every record. Where Go's HTTP types differ from `fetch`'s, the Go implementation makes up for it:

- The request target is hashed as a WHATWG URL serializes it, as TypeScript gets it from `Request.url`. `RequestTarget` parses `r.RequestURI` with the URL Standard's rules, so `/a/../notes` and `/notes` are one request, `/café` is `/caf%C3%A9`, and an absolute-form target (`http://host/notes`) hashes as its path. A request whose `RequestURI` is empty (built for a handler, not read by a server) is hashed by `r.URL.RequestURI()`, which Go has already escaped its own way.
- Go strings are bytes, so a header value is hashed and stored as the bytes received, where TypeScript reads each byte as one character.
- Go moves `Host` out of the request's headers, so `Handle` takes it from `r.Host` when it is a fingerprint header.
- Go's `http.Header` is a map, so a response's headers are stored by name in byte order, each name's values in order.

The [interop e2e](/packages/idempotency-keys/reference/specification#interop) runs a server in each language against the other on every store and notifier.

The full API is in the [README](https://github.com/JacobLey/leyman/tree/main/tools/idempotency-keys/go) and the package docs (`go doc`), and versions are in its [changelog](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/go/CHANGELOG.md).
