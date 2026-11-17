# demo-openapi-go

A Go client and server for the [OpenAPI demo](../README.md)'s notes API, built from the same `openapi.json` as the TypeScript ones, so either client can call either server, and both servers can share one database.

An API's document is only a contract if every implementation is held to it. Two implementations that each read their own copy, or that were written to match it once by hand, agree only until one of them changes. Here neither language has a copy: both read the one document, take their types from it, and check the wire against it, so being interchangeable follows from how they're built. The tests then check it anyway.

```go
import (
	"github.com/JacobLey/leyman/demos/openapi/go/client"
	"github.com/JacobLey/leyman/demos/openapi/go/notes"
)

notesClient, err := client.New(client.Options{BaseURL: "http://localhost:3000", Token: client.StaticToken(token)})

created, err := notesClient.CreateNote(ctx, notes.CreateNoteInput{
	Body:   notes.NewNote{Title: "Dolly", Body: "A sheep"},
	Header: &notes.CreateNoteInputHeader{IdempotencyKey: &key},
})
switch {
case created.Created != nil:
	fmt.Println(created.Created.ID) // a notes.Note
case created.BadRequest != nil:
	fmt.Println(created.BadRequest.Message) // a notes.ApiError
}
```

## One document, two languages

The spec package's `openapi.json` is the contract for both languages. Rather than copy it, the spec package is also a tiny Go module whose one file embeds it (`//go:embed out/openapi.json`), so the Go server reads its routes, parameters and schemas from the same bytes the TypeScript server hands to Ajv. A change to the spec reaches both servers and both clients at once, and a Go and a TypeScript server can't disagree about what a valid request is unless their validators do.

The types come from the same document. The `notes` package is written by [genever-go](../../../apps/genever/go) (`--parameter-defaults --signed`), from a `//go:generate go tool genever` directive that the `genever-go` target runs in `prepare`. The file is committed and signed, so an edit to it fails, and CI fails if it's stale. Each operation gets an `<Id>Input` (what a call sends), an `<Id>Request` (what a handler gets, with `limit` filled in) and an `<Id>Response<Status>` per response.

Each operation's result (`ListNotesResult` and so on) is generated too: one pointer per documented response, of which exactly one is set. A handler sets one to answer with it, and the client gets the one the server answered with. Its `Response()` gives the server the status and body to check against the document, and `UnmarshalResponse` decodes a response into the field for its status, so neither side needs reflection, and neither has a hand-written list of statuses that could drift from the document.

## The server

`server.New` serves every operation in the document with Go's `net/http` (`/notes/{noteId}` is already a `ServeMux` pattern), in the same order as [the TypeScript server](../server/README.md#how-a-request-flows): authenticate, limit the body to 128 KiB, hold the `Idempotency-Key`, validate the request, call the handler, and validate its response. Statuses, `ApiError` codes, the `WWW-Authenticate`, `Allow` and `Idempotent-Replayed` headers, and the Protected Resource Metadata are the same as the TypeScript server's. Its messages for a request that doesn't match the document are its own, since they come from another validator.

- Validation uses [santhosh-tekuri/jsonschema](https://github.com/santhosh-tekuri/jsonschema) with the whole document added as one resource, so `$ref`s resolve exactly as in the document, and each location's parameters are compiled as one closed object of `$ref`s to their schemas. Formats (`uuid`, `date-time`) are asserted, as with ajv-formats.
- Parameters arrive as strings, so they're coerced the way Ajv's `coerceTypes` does, and get their schema's default. That includes JavaScript's idea of a number: `" 5"`, `"0x5"` and `"1e1"` are numbers to Ajv, so they are here too, and `""` isn't. Bodies and responses are JSON already, and aren't coerced.
- JSON Schema patterns are ECMAScript's, and Go's `regexp` has no `\uXXXX`, so the spec's `^[^\u0000]*$` is translated to `\x{0000}` before compiling. A note with a NUL is then a `400`, as in TypeScript, rather than a failed insert.
- Handlers are an interface (`ListNotes`, `CreateNote`, `GetNote`), each typed by genever-go's `<Id>Request` and the operation's result. `NewPostgresHandlers` runs plain SQL through a pgx pool against the database package's `notes` table, and writes times as JavaScript's `toISOString` does (UTC, to the millisecond), so a note reads the same from either server.
- Authentication is an `Authenticator` interface. `NewStaticTokens` hashes each token with SHA-256 and compares it in constant time against every allowed token. `NewJWTAuthenticator` checks RFC 9068 access tokens with [jwx](https://github.com/lestrrat-go/jwx), finding the issuer's keys by OpenID Connect discovery: the signature, `typ`, `iss`, `aud`, `exp` and every scope, and it refuses a client's own token (`sub` equal to `client_id`). An issuer that can't be reached is a `500` reported to `OnError`, not a `401`, since the token may well be fine. A token signed with a key it doesn't know (a `kid` it doesn't have, or no `kid` and no key that verifies it) fetches the keys again, at most every 30 seconds, as jose does, so an issuer that rotates its one key without a `kid` is followed too.
- A handler that returns an error or panics gets a `500`, reported to `OnError`, as a TypeScript handler that throws does. net/http's own recovery would drop the connection without a response.
- Idempotency keys go through [idempotency-keys' Go module](../../../tools/idempotency-keys/go) on the same `idempotency_keys` table, scoped to the token's subject and the `operationId`. Both implementations follow one specification for their hashes and rows, so a retry that reaches the other server still gets the first response. Its answers to a request it can't run are the same `ApiError`s as the TypeScript server's.

`cmd/notes-server` serves it from flags or environment variables (`--database-url`, `--listen`, `--static-token subject=token` or `--jwt-issuer` and `--jwt-audience`, `--resource`, `--authorization-server`, `--idempotency-wait`; `--help` lists their variables). It prints the URL it listens on once it does, so `--listen 127.0.0.1:0` works for tests, and shuts down on `SIGTERM`, letting running requests finish.

## The client

One method per operation, taking genever-go's `<Id>Input` and returning the operation's result. The method, path and documented statuses come from the embedded document, and the request is built from the input's own JSON encoding (its `path`, `query` and `header` parameters and `body`), so the client has no per-operation code beyond the method itself. A status the document doesn't give the operation, such as a `500`, is an `*UnexpectedStatusError`. The token is a `TokenSource`, called before each request, so an expiring token can be refreshed, and the `*http.Client` is yours.

## Interchangeable by construction

Nothing on the Go side lists the API by hand. Routes, the scopes each operation needs, which operations take an `Idempotency-Key` (and whether they must), every parameter and schema, and the statuses each operation documents are all read from the embedded `openapi.json`, as the TypeScript server and client read them. The types are generated from it, and CI fails if they're stale. So a change to the spec reaches all four packages together, and the Go and TypeScript sides can only disagree where their validators read a schema differently, or where a handler does something the document doesn't describe.

The tests check that anyway, because those are exactly the places a contract doesn't cover:

- The TypeScript server's integration suites (notes, idempotency keys and JWTs) run against both servers, through the TypeScript client, with the same expectations. The Go server is the `notes-server` binary, built once per run and started per test. Only tests that swap the TypeScript server's internals (handlers that break the contract, a store that fails) run on it alone.
- A retry crosses servers: a `createNote` sent to one server with an `Idempotency-Key`, then to the other on the same database, is replayed with the same note. That only works because both follow one [specification](../../../tools/idempotency-keys/SPEC.md) for the key's fingerprint and row.
- The Go client calls the TypeScript server, and the Go server too, from `client/interop_test.go`. It's behind the `interop` build tag, so plain `go test` leaves it out, and the TypeScript server's suite runs it once against each server.

Running them side by side turned up one real difference: ajv-formats accepts a UUID URN (`urn:uuid:…`) as a `uuid`, which the TypeScript server then sent to Postgres and answered with a `500`. JSON Schema's `uuid` is the plain RFC 4122 form, so the TypeScript server now asserts that, and both answer `400`.

## Testing

Every test that needs Postgres gets a database of its own, cloned from a template built once per package run from the database package's `schema.sql`, which is what pg-dolly does for the TypeScript tests (`internal/pgtest`). The server's tests send raw HTTP, to check headers and bodies exactly. The JWT tests serve discovery and keys from an `httptest.Server` and sign their own tokens, and the client's tests call the Go server in-process. A duplicate of a running request is tested without timing: the first request's handler is held until the store reports that the duplicate found the key held.

```sh
nx run @leyman/demo-openapi-go:verify
```

## What was learned

- `go generate -run` matches the directive's whole text, `//go:generate` included, not the command after it.
- jwx requires a `kid` by default when verifying against a key set, while jose tries every key that fits, so `jws.WithRequireKid(false)` keeps a single-key issuer that omits it working.
- net/http recovers a handler that panics by dropping the connection, so a client gets no response and nothing is reported. The server recovers it first and answers `500`, passing on only `http.ErrAbortHandler`, net/http's way to drop a connection on purpose.
- Go's `ServeMux` answers a method a path doesn't have with a plain-text `405` of its own, so each path is registered without a method, and its handler answers the document's way.

## Not covered

- Everything the TypeScript server doesn't cover either (see [its README](../README.md#not-covered)).
- Parameter schemas that are `$ref`s: validation follows them, but coercion reads `type` and `default` from the parameter's own schema, and every parameter in this spec has them inline.
- jwx also refuses a token whose `iat` is in the future, which jose doesn't check.
- Go's `ServeMux` redirects a path that isn't clean (`/notes/../notes`) with a `301`, where Hono answers it as the path it is.
