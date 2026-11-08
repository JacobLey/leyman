# idempotency-keys

`Idempotency-Key` handling for HTTP writes: a retried request runs once, on any instance, and gets the first response
back. TypeScript and Go implementations share one store and one notifier, so servers in both languages can serve the
same keys.

Every implementation follows one [specification](./SPEC.md): the hashes, what goes in the store, and the notification
that wakes a waiting request.

- **One run per key, across every instance**: a duplicate of a running request waits for its response (or gets a
  `409`), and a later one replays it.
- **A reused key on a different request is a `422`**, never a silent replay of someone else's response.
- **A crashed request holds up no one for long**: its claim is a lease, and once it runs out a waiting request takes
  over.
- **Postgres or Valkey**: Postgres is strict and durable; Valkey is lax (a failover can forget a key). Notifications
  through either, or none, only make waiting faster.

## Packages

| Package | Status |
|---------|--------|
| [`ts`](./ts/) | The TypeScript implementation, published to npm as [`idempotency-keys`](https://www.npmjs.com/package/idempotency-keys) |
| [`go`](./go/) | The Go implementation, with `net/http` middleware, released as the Go module `github.com/JacobLey/leyman/tools/idempotency-keys/go` |
| [`test-vectors`](./test-vectors/) | The scenarios and hashes every implementation passes, in this repository only |
