# idempotency-keys-go

Server-side support for the Idempotency-Key header in Go, so clients can safely retry a POST. Works across instances, on Postgres, Valkey or DynamoDB.

When a client sends a `POST` and the connection drops before the response arrives, it can't tell whether the server handled the request, and a retry might create the same order twice. The `Idempotency-Key` header, popularized by Stripe and now an [IETF draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07), lets the client send one unique key with every attempt of a request, so the server can recognize a retry and send back what it answered the first time.

This module handles that header in a Go server, with `net/http` middleware. The first request with a key runs your handler, and its status, headers and body are saved in Postgres, Valkey or DynamoDB, through your own `pgx` pool, `valkey-go` client or AWS SDK client. A retry with the same key gets that response back, marked `Idempotent-Replayed: true`, on whichever instance it reaches. A request only counts as a retry if its method, path, query, body and any headers you name match the first one, and a key reused on a different request gets a `422`.

A retry that comes in while the first request is still running waits for it to finish, or gets a `409` if the wait runs out. The first request's claim on the key is a lease, so if its server crashes, a waiting request takes over once the lease runs out. A response the first request sends after that isn't stored.

It is the Go side of [idempotency-keys](../ts/). Both implementations follow one [specification](../SPEC.md) for their hashes, rows and notifications, and pass the same [test vectors](../test-vectors/), so Go and TypeScript servers on one store share the same keys. This module implements version 1.1 of the specification, exported as `SpecVersion`.

Use the Postgres or DynamoDB store for payments and anything else where a duplicate would really hurt. On Valkey, a failover that loses writes, or a flush, forgets keys, and a retry after that runs again.

Guides, including one [for Go](https://jacobley.github.io/leyman/packages/idempotency-keys/guides/go), are on the [docs site](https://jacobley.github.io/leyman/packages/idempotency-keys/).

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
  - [Valkey](#valkey)
  - [DynamoDB](#dynamodb)
  - [Without net/http](#without-nethttp)
  - [Renewing a lease](#renewing-a-lease)
  - [Which responses are stored](#which-responses-are-stored)
  - [Writing a store](#writing-a-store)
- [API](#api)
- [Limits](#limits)
- [Development](#development)

## Install

```sh
go get github.com/JacobLey/leyman/tools/idempotency-keys/go@latest
```

It needs Go 1.25 or later, and versions are listed in the [changelog](./CHANGELOG.md). The core package has no dependencies. The `postgres` package uses [pgx](https://github.com/jackc/pgx) v5, because `database/sql` can't `LISTEN`, the `valkey` package uses [valkey-go](https://github.com/valkey-io/valkey-go), and the `dynamodb` package uses the [AWS SDK for Go v2](https://github.com/aws/aws-sdk-go-v2). Each package only brings in its own client, so you only download what you import.

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

Requests without an `Idempotency-Key` header go straight to the handler. If you'd rather reject them, set `Required` and they get a `400`.

A retry that arrives while the first request with its key is still running waits for up to 10 seconds by default (`WithWait`). The notifier is optional. Without it, a waiting retry polls the store, 50 ms after its first try and then twice as long each time, up to a second apart. With it, the retry is woken as soon as the first request finishes, even on another instance.

## Usage

Keys are kept per caller. Pass the user or tenant id as `Scope`, so that two users who happen to send the same key don't collide.

`Operation` is optional. If you set it (any name you pick, such as an OpenAPI `operationId`), a client can reuse the same key on different endpoints and each is treated separately. If you leave it empty, a key belongs to the caller as a whole, and reusing it on another endpoint gets a `422`.

When `Handle` or `Middleware` turns a request away itself, it responds with an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem document (`application/problem+json`), using the status codes from the [IETF draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07):

| Status | When                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------- |
| `400`  | The `Idempotency-Key` header can't be read, or the operation requires one and the request has none. |
| `409`  | A request with the key is still running, and waiting for it ran out.                                |
| `422`  | The key was used on a different request (another method, path, query, body or named header).        |
| `413`  | The body is over an `http.MaxBytesReader` limit set before it.                                      |
| `500`  | The store failed before the request ran, so the handler wasn't called.                              |

To send something else, pass `WithProblem` and `WithErrorHandler`.

The path and query are hashed the way a WHATWG URL serializes them, which is how the TypeScript implementation sees them through `Request.url`. `RequestTarget` parses `r.RequestURI` with the URL Standard's rules for an http(s) path and query. That means `/a/../notes` and `/notes` count as the same request, `/café` is hashed as `/caf%C3%A9`, and an absolute-form target (`http://host/notes`) is hashed as just its path.

Keys expire after 24 hours by default (`WithTTL`). Postgres doesn't delete expired rows by itself. They do no harm, since the next request with the same key overwrites the row, but the table keeps growing, so call `DeleteExpired` from a scheduled job.

### Valkey

```go
import valkeystore "github.com/JacobLey/leyman/tools/idempotency-keys/go/valkey"

client, _ := valkey.NewClient(valkey.ClientOption{InitAddress: []string{"valkey:6379"}})
notifier, _ := valkeystore.Listen(ctx, client, valkeystore.NotifierOptions{})
keys, _ := idempotencykeys.New(valkeystore.NewStore(client, valkeystore.StoreOptions{}), idempotencykeys.WithNotifier(notifier))
```

The store runs the spec's Lua scripts with `EVAL`, and each script touches a single key, so it works on a cluster. The notifier subscribes on a connection it takes from the client (`Dedicate`) and keeps it until `Close`. You can mix stores and notifiers, so a Postgres store with a Valkey notifier is fine.

### DynamoDB

```go
import (
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	dynamodbstore "github.com/JacobLey/leyman/tools/idempotency-keys/go/dynamodb"
)

cfg, _ := config.LoadDefaultConfig(ctx)
client := dynamodb.NewFromConfig(cfg)
// Once, in a migration or your infrastructure code
options := dynamodbstore.StoreOptions{}
if _, err := client.CreateTable(ctx, dynamodbstore.CreateTableInput(options)); err != nil {
	return err
}
// A new table takes a few seconds to be ACTIVE, and UpdateTimeToLive fails on one still CREATING
table := &dynamodb.DescribeTableInput{TableName: dynamodbstore.CreateTableInput(options).TableName}
if err := dynamodb.NewTableExistsWaiter(client).Wait(ctx, table, 5*time.Minute); err != nil {
	return err
}
if _, err := client.UpdateTimeToLive(ctx, dynamodbstore.UpdateTimeToLiveInput(options)); err != nil {
	return err
}

keys, _ := idempotencykeys.New(dynamodbstore.NewStore(client, dynamodbstore.StoreOptions{}))
```

Like Postgres, it is strict. A claim is a single conditional `PutItem`, so only one request can win it, and DynamoDB keeps it durably. When the claim loses, DynamoDB sends back the item that beat it, so a claim never needs a second request to read it.

DynamoDB has no clock that a condition can read, so the store uses each server's own clock (`time.Now()`). If one server's clock runs ahead of another's, it sees leases run out early and can take one over while its request is still running. Set the lease to your slowest handler plus the worst drift you expect between servers. A key can also expire early by that much.

`CreateTableInput` and `UpdateTimeToLiveInput` give the requests for the table: a partition key `identity` (binary), billed on demand, and DynamoDB's Time to Live on the `ttl` attribute. Create the table however you manage infrastructure, as long as the key is the same. Time to Live is optional. It deletes expired items some time after they expire, so the table doesn't keep growing. The store never relies on it, since every request checks the expiry itself, and without it an expired item stays until the next claim of its key writes over it. There is no `DeleteExpired`.

A DynamoDB item holds at most 400 KB, so a response bigger than that (less the few attributes around it) can't be stored. `Complete` returns DynamoDB's error, and the key is left to its lease, as when a server crashes.

There is no DynamoDB notifier. Without one, waiting requests poll the store. If you already run Valkey or Postgres, either notifier works with the DynamoDB store.

### Without net/http

`Begin` gives you the same flow in any framework. Hash the request with `ComputeFingerprint`, call `Begin`, and then run the handler, replay the stored response, or send an error, depending on the outcome:

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
	result.Attempt.Respond(ctx, response) // stored, released by the policy, or lost
	return response
case idempotencykeys.OutcomeReplay:
	return *result.Response
case idempotencykeys.OutcomeConflict:
	return conflict409()
case idempotencykeys.OutcomeMismatch:
	return unprocessable422()
}
```

If an attempt never ends, because its server crashed or the handler panicked, it holds the key until its lease runs out. After that, the next request with the key runs.

### Renewing a lease

A request that can run longer than the lease, such as a job, keeps its key by renewing it more often than the lease runs out, from a heartbeat, say. `Attempt.Renew(ctx)` moves the lease forward by `WithLease` and the key's expiry by `WithTTL`, both from now, so the lease only has to cover the time between renewals:

```go
renewed, err := result.Attempt.Renew(ctx)
if err == nil && !renewed {
	// another request took over: stop, as this one's response won't be stored
}
```

It returns false when the attempt no longer holds the key: another request took over after its lease ran out, the attempt already ended, or the key expired. A lease that ran out still renews if nobody took over. The built-in stores all renew. On a store of your own without a `Renew` method, it returns an error matching `ErrRenewUnsupported` (see [Writing a store](#writing-a-store)).

### Which responses are stored

By default every response is stored except a `429` (Too Many Requests), since that status says nothing was done. That includes `5xx` responses, because a handler that failed halfway may already have written something, and running it again could write it twice. If your handlers are transactional, you can release `5xx` responses too, so that a retry runs again:

```go
keys, _ := idempotencykeys.New(store, idempotencykeys.WithRespondPolicy(func(r idempotencykeys.StoredResponse) idempotencykeys.Action {
	if r.Status == 429 || r.Status >= 500 {
		return idempotencykeys.ActionRelease
	}
	return idempotencykeys.ActionComplete
}))
```

A response a replay couldn't send, with a status outside 200 to 599 or a body on a `204`, `205` or `304`, can't be stored. `Respond` returns an error matching `ErrUnsendableResponse` for it, before asking the policy, and the attempt still holds the key, so you can respond again or release it. `Handle` sends such a response anyway, reports the error to `WithOnError`, and leaves the key to its lease.

### Writing a store

`New` takes any `Store`, so you can keep records somewhere other than Postgres or Valkey. A store only keeps records: the module does the hashing, waiting, policy and notifying. It has to meet the spec's [store contract](../SPEC.md#the-store-contract): each operation is atomic for its identity, an expired record counts as absent, a running record is only taken over by a request with the same fingerprint, `Complete` and `Release` only change a record that still holds their token, and a failure is an error rather than an answer.

Renewing is optional: a store with a `Renew` method too (the `Renewer` interface) can renew attempts, under the same rules as `Complete`. A store that wraps another has to forward `Renew` itself, as embedding the `Store` interface hides it.

The built-in stores measure leases on their own clock. A store without a clock may use the servers' (`time.Now()`), but then a server whose clock runs ahead can take over a lease early, so the lease has to cover your slowest handler plus the worst drift between servers. A store's layout is its own, so only servers that implement it share its keys.

[`example_test.go`](./example_test.go) has a small in-memory store written to the contract, which the tests run against every scenario in the test vectors, as they do the built-in stores. It only serves one process, so it is an example, not something to deploy.

## API

The API follows the TypeScript package's, adapted to Go's conventions. The full reference is in the package docs (`go doc`).

| TypeScript                                       | Go                                                                                                                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new IdempotencyKeys({ store, ...options })`     | `New(store, ...Option)`: `WithNotifier`, `WithTTL`, `WithLease`, `WithWait`, `WithRespondPolicy`, `WithFingerprintHeaders`, `WithProblem`, `WithErrorHandler`, `WithOnError` |
| `keys.handle(request, options, run)`             | `keys.Handle(w, r, HandleOptions, next)`, or `keys.Middleware(func(*http.Request) HandleOptions)`                                                                            |
| `keys.begin(params)`                             | `keys.Begin(ctx, BeginParams)`, a `BeginResult` with its `Outcome`, `Attempt` and `Response`                                                                                 |
| `attempt.respond(response)`, `attempt.release()` | `Attempt.Respond(ctx, StoredResponse)`, `Attempt.Release(ctx)`                                                                                                               |
| `attempt.renew()`, a store's optional `renew`    | `Attempt.Renew(ctx)`, a store's optional `Renewer`                                                                                                                           |
| `parseIdempotencyKey(values)`                    | `ParseKey(values)`, `""` without a header                                                                                                                                    |
| `computeIdentity`, `computeFingerprint`          | `ComputeIdentity(IdentityInput)`, `ComputeFingerprint(FingerprintInput)`, with `Headers` an `http.Header`                                                                    |
| `requestTarget(url)`                             | `RequestTarget(rawTarget)`                                                                                                                                                   |
| `defaultRespondPolicy`, `problemResponse`        | `DefaultRespondPolicy`, `WriteProblem`                                                                                                                                       |
| `SPEC_VERSION`                                   | `SpecVersion`                                                                                                                                                                |
| `new PostgresStore({ client, table? })`          | `postgres.NewStore(Querier, StoreOptions)`, a `*pgxpool.Pool` or `*pgx.Conn`; `DeleteExpired(ctx)`                                                                           |
| `createTableSql(table?)`                         | `postgres.CreateTableSQL(StoreOptions)`                                                                                                                                      |
| `PostgresNotifier.listen(...)`                   | `postgres.Listen(ctx, publisher, *pgx.Conn, NotifierOptions)`; `Close(ctx)` runs `UNLISTEN`                                                                                  |
| `new ValkeyStore({ connection, prefix? })`       | `valkey.NewStore(valkey.Client, StoreOptions)`                                                                                                                               |
| `ValkeyNotifier.listen(...)`                     | `valkey.Listen(ctx, valkey.Client, NotifierOptions)`; `Close()`                                                                                                              |
| `new DynamoDbStore({ connection, table? })`      | `dynamodb.NewStore(dynamodb.Client, StoreOptions)`, a `*dynamodb.Client` from the AWS SDK                                                                                    |
| `createTableInput`, `updateTimeToLiveInput`      | `dynamodb.CreateTableInput(StoreOptions)`, `dynamodb.UpdateTimeToLiveInput(StoreOptions)`                                                                                    |

Durations are `time.Duration`s of whole milliseconds, as in the spec. An empty name (`Operation`, a table, a prefix or a channel) means none, or the default.

Errors can be matched with `errors.Is`. `ErrOption` is an `*OptionError` with its `Option` and `Value`, `ErrKeyHeader` is a `*KeyHeaderError` with its `Values`, `ErrUnsendableResponse` is a response `Respond` can't store, `ErrRenewUnsupported` is a `Renew` on a store that isn't a `Renewer`, and `ErrStoredRecord` means the store holds a record that no implementation writes. The DynamoDB store passes on a client's `ConditionalCheckFailedException` that carries no item (a wrapper that drops `ReturnValuesOnConditionCheckFailure`) rather than calling it a stored record, since nothing says what holds the key.

If a Postgres listening connection fails, or a Valkey subscription drops, the error is reported to `NotifierOptions.OnError`. Waiting requests then fall back to polling, so to get notifications back, listen again on a new connection.

Go strings are bytes, so a header value is hashed and stored as the bytes received, while TypeScript reads each byte as one character. The spec makes both come out the same. Go also moves `Host` out of the request's headers, so when `Host` is a fingerprint header, `Handle` reads it from `r.Host`.

## Limits

- **Responses are buffered** so they can be stored. `next` writes to a recorder, which means it can't flush, hijack the connection or send informational (`1xx`) responses, and the response is only sent once `next` returns.
- **Headers are stored by name, in byte order of their lower-case names.** Go's `http.Header` is a map, so there is no other order to keep. Names differing only in case, which a handler can only set by writing to the map directly, are in byte order of the names as set. The values under each name keep their order.
- **A request with an empty `RequestURI`** (one built to call a handler directly, rather than read by a server) is hashed by `r.URL.RequestURI()`, which Go has already escaped in its own way.
- **`Handle` never renews.** Behind the middleware, set the lease above your slowest handler, since a request that runs longer can be taken over and run twice. Use `Begin` and `Attempt.Renew` for longer work.
- **DynamoDB uses the servers' clocks**, so on that store the lease also has to cover clock drift between servers, and a stored response is limited to what fits in a 400 KB item.

## Development

Run it through Nx, like any other project:

```sh
nx run @leyman/idempotency-keys-go:verify
```

It has no `package.json`. The tests read the [test vectors](../test-vectors/) by path, which `project.json` lists as an implicit dependency. They run against the devcontainer's Postgres (`$DATABASE_URL`) and Valkey (`valkey:6379`) sidecars, and against DynamoDB in [AWS Emulator](https://github.com/aws/aws-emulator), which the devcontainer installs and each test run starts on its own through [aws-emulator-launch](../../aws-emulator-launch/go/) (the root package and `dynamodb` each start one, with one table). So `go test ./...` also works directly there. If `aws-emulator` isn't on `PATH`, the tests fail and say to rebuild the devcontainer.
