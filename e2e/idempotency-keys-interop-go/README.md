# e2e-idempotency-keys-interop-go

The Go server that [`e2e/idempotency-keys-interop`](../idempotency-keys-interop/) runs, on the `net/http` middleware of [idempotency-keys-go](../../tools/idempotency-keys/go/). That package runs it next to the same server written on the TypeScript implementation, on one store and notifier, and checks that the two serve one set of keys.

It is one `main` package, [`main.go`](./main.go), whose doc comment lists its configuration (environment variables shared with the TypeScript server) and its one route. It requires the library through a `replace` to the workspace copy, so it always runs the code in this checkout.

It has no tests of its own, since the interop e2e builds it with `go build` and drives it. It is not released.
