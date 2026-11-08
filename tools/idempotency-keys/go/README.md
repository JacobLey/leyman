# idempotency-keys-go

Idempotency-Key handling for Go HTTP writes on Postgres or Valkey: a retried request runs once across every instance, waits on a running duplicate, and replays the first response. The Go implementation of [idempotency-keys](../ts/), sharing its keys.

- **One run per key, across every instance**: a duplicate of a running request waits for its response (or gets a `409`), and a later one gets the stored response back, marked `Idempotent-Replayed: true`.
- **A reused key on a different request is a `422`**, never a replay of another request's response: the method, path, query, body and the headers you name must match.
- **A crashed request holds up no one for long**: its claim is a lease, and once it runs out a waiting request takes over. A response that comes after that isn't stored.
- **Postgres or Valkey**: pass your own `pgx` pool or `valkey-go` client. Postgres is strict and durable; Valkey is lax (a failover can forget a key). Notifications through either, or none, only make waiting faster.
- **Shares keys with TypeScript**: hashes, rows and notifications follow the [idempotency-keys specification](../SPEC.md), held to the same [test vectors](../test-vectors/), so a Go server and a TypeScript server on one store serve one set of keys.

It doesn't fit a write that must never run twice whatever happens to the store: on Valkey, a failover that loses writes or a flush forgets keys. Use the Postgres store for payments.

Guides, including one [for Go](https://jacobley.github.io/leyman/packages/idempotency-keys/guides/go), are on the [docs site](https://jacobley.github.io/leyman/packages/idempotency-keys/).

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
  - [Valkey](#valkey)
  - [Without net/http](#without-nethttp)
  - [Which responses are stored](#which-responses-are-stored)
- [API](#api)
- [Limits](#limits)
- [Development](#development)

## Install

```sh
go get github.com/JacobLey/leyman/tools/idempotency-keys/go@latest
```

It needs Go 1.25 or later. Versions are listed in the [changelog](./CHANGELOG.md). The core package has no dependencies; the `postgres` package uses [pgx](https://github.com/jackc/pgx) v5 (`database/sql` can't `LISTEN`), and the `valkey` package [valkey-go](https://github.com/valkey-io/valkey-go).

## Example

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

A request without an `Idempotency-Key` header runs as usual (set `Required` to answer it with a `400` instead). The first request with a key runs, and its response is stored. A retry gets the same status, headers and body back. A retry while the first still runs waits up to the wait (10 seconds by default) for it.

## Usage

Each key has an identity: the `Scope` (who is calling, such as a user or tenant id), the optional `Operation` (any name you pick, such as an OpenAPI `operationId`), and the key. One caller's keys never touch another's. With an `Operation`, the same key on another operation is another key; without one, reusing a key on another endpoint is a `422`.

`Handle` and `Middleware` answer themselves with an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem document (`application/problem+json`), with the status codes of the [IETF draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07):

| Status | When                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------- |
| `400`  | The `Idempotency-Key` header can't be read, or the operation requires one and the request has none. |
| `409`  | A request with the key is still running, and waiting for it ran out.                                |
| `422`  | The key was used on a different request (another method, path, query, body or named header).        |
| `413`  | The body is over an `http.MaxBytesReader` limit set before it.                                      |
| `500`  | The store failed before the request ran, so it never runs unprotected.                              |

Pass `WithProblem` and `WithErrorHandler` to answer differently.

The request target is hashed as a WHATWG URL serializes it, as the TypeScript implementation gets it from `Request.url`: `RequestTarget` parses `r.RequestURI` with the URL Standard's rules for an http(s) path and query, so `/a/../notes` and `/notes` are one request, `/café` is `/caf%C3%A9`, and an absolute-form target (`http://host/notes`) hashes as its path.

A Postgres store never deletes expired rows on its own. Call `DeleteExpired` from a scheduled job, or leave them to be overwritten by the next request with the key.

### Valkey

```go
import valkeystore "github.com/JacobLey/leyman/tools/idempotency-keys/go/valkey"

client, _ := valkey.NewClient(valkey.ClientOption{InitAddress: []string{"valkey:6379"}})
notifier, _ := valkeystore.Listen(ctx, client, valkeystore.NotifierOptions{})
keys, _ := idempotencykeys.New(valkeystore.NewStore(client, valkeystore.StoreOptions{}), idempotencykeys.WithNotifier(notifier))
```

The store runs the spec's Lua scripts with `EVAL`, one key each, so it works on a cluster. The notifier subscribes on a connection it takes from the client (`Dedicate`) until `Close`. Either notifier works with either store: a Postgres store with a Valkey notifier is fine.

### Without net/http

`Begin` is the same flow for any framework. Hash the request with `ComputeFingerprint`, then run, replay, or answer as it says:

```go
key, err := idempotencykeys.ParseKey(headerValues) // a *KeyHeaderError: a 400
if key == "" {
	return createNote() // no key: runs as it would without the library
}
fingerprint := idempotencykeys.ComputeFingerprint(idempotencykeys.FingerprintInput{
	Headers: headers, Method: method, Target: idempotencykeys.RequestTarget(rawTarget), Body: body,
})
result, err := keys.Begin(ctx, idempotencykeys.BeginParams{Scope: scope, Operation: "createNote", Key: key, Fingerprint: fingerprint})

switch result.Outcome {
case idempotencykeys.OutcomeRun:
	response := createNote()
	result.Attempt.Respond(ctx, response) // stored, released by the policy, lost, or refused
	return response
case idempotencykeys.OutcomeReplay:
	return *result.Response
case idempotencykeys.OutcomeConflict:
	return conflict409()
case idempotencykeys.OutcomeMismatch:
	return unprocessable422()
}
```

An attempt that never ends (its server crashed, or the handler panicked) holds the key until its lease runs out, then the next request with the key runs.

### Which responses are stored

By default every response is stored except a `429` (Too Many Requests), which says nothing was done. That includes a `5xx`: a handler that failed halfway may have written something, and running it again could write it twice. If your handlers are transactional, release `5xx` responses too, so a retry runs again:

```go
keys, _ := idempotencykeys.New(store, idempotencykeys.WithRespondPolicy(func(r idempotencykeys.StoredResponse) idempotencykeys.Action {
	if r.Status == 429 || r.Status >= 500 {
		return idempotencykeys.ActionRelease
	}
	return idempotencykeys.ActionComplete
}))
```

## API

The API follows the TypeScript package's, with Go's conventions. The full reference is in the package docs (`go doc`).

| TypeScript                                       | Go                                                                                                                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new IdempotencyKeys({ store, ...options })`     | `New(store, ...Option)`: `WithNotifier`, `WithTTL`, `WithLease`, `WithWait`, `WithRespondPolicy`, `WithFingerprintHeaders`, `WithProblem`, `WithErrorHandler`, `WithOnError` |
| `keys.handle(request, options, run)`             | `keys.Handle(w, r, HandleOptions, next)`, or `keys.Middleware(func(*http.Request) HandleOptions)`                                                                            |
| `keys.begin(params)`                             | `keys.Begin(ctx, BeginParams)`, a `BeginResult` with its `Outcome`, `Attempt` and `Response`                                                                                 |
| `attempt.respond(response)`, `attempt.release()` | `Attempt.Respond(ctx, StoredResponse)`, `Attempt.Release(ctx)`                                                                                                               |
| `parseIdempotencyKey(values)`                    | `ParseKey(values)`, `""` without a header                                                                                                                                    |
| `computeIdentity`, `computeFingerprint`          | `ComputeIdentity(IdentityInput)`, `ComputeFingerprint(FingerprintInput)`, with `Headers` an `http.Header`                                                                    |
| `requestTarget(url)`                             | `RequestTarget(rawTarget)`                                                                                                                                                   |
| `defaultRespondPolicy`, `problemResponse`        | `DefaultRespondPolicy`, `WriteProblem`                                                                                                                                       |
| `new PostgresStore({ client, table? })`          | `postgres.NewStore(Querier, StoreOptions)`, a `*pgxpool.Pool` or `*pgx.Conn`; `DeleteExpired(ctx)`                                                                           |
| `createTableSql(table?)`                         | `postgres.CreateTableSQL(StoreOptions)`                                                                                                                                      |
| `PostgresNotifier.listen(...)`                   | `postgres.Listen(ctx, publisher, *pgx.Conn, NotifierOptions)`; `Close(ctx)` runs `UNLISTEN`                                                                                  |
| `new ValkeyStore({ connection, prefix? })`       | `valkey.NewStore(valkey.Client, StoreOptions)`                                                                                                                               |
| `ValkeyNotifier.listen(...)`                     | `valkey.Listen(ctx, valkey.Client, NotifierOptions)`; `Close()`                                                                                                              |

Durations are `time.Duration`s of whole milliseconds, as the spec's options are. An empty name (`Operation`, a table, prefix or channel) means none or the default. Errors match with `errors.Is`: `ErrOption` (an `*OptionError` with its `Option` and `Value`), `ErrKeyHeader` (a `*KeyHeaderError` with its `Values`) and `ErrStoredRecord` (a store holding a record no implementation writes). A Postgres listening connection that fails is reported to `NotifierOptions.OnError`, as is a Valkey subscription that drops; waiting requests then only poll, so listen again on a new connection to get notifications back.

Go strings are bytes, so a header value is hashed and stored as the bytes received, where TypeScript reads each byte as one character; the spec makes both the same. Go moves `Host` out of the request's headers, so `Handle` takes it from `r.Host` when it is a fingerprint header.

## Limits

- **Responses are buffered** to be stored: `next` writes to a recorder, so it can't flush, hijack the connection, or send informational (`1xx`) responses, and the response is sent once it returns.
- **Headers are stored by name, in byte order.** Go's `http.Header` is a map, so it has no other order to keep; each name's values keep theirs.
- **A request whose `RequestURI` is empty** (built for a handler, not read by a server) is hashed by `r.URL.RequestURI()`, which Go has already escaped its own way.
- **No lease renewal.** Set the lease above your slowest handler: a request that runs longer can be taken over, and run twice.

## Development

Run through Nx, like any other project:

```sh
nx run @leyman/idempotency-keys-go:verify
```

It has no `package.json`. The tests read the [test vectors](../test-vectors/) by path, an implicit dependency in `project.json`, and run against the Postgres (`$DATABASE_URL`) and Valkey (`valkey:6379`) sidecars of the devcontainer, so `go test ./...` also works directly there.
