# idempotency-keys

Server-side support for the `Idempotency-Key` header, so clients can safely retry a `POST`. There are TypeScript and Go implementations, and servers in both languages can share the same keys.

With the header, a client sends one unique key with every attempt of the same request. The server runs the first request with a key and saves its response, and answers retries with that saved response instead of running the request again. Both implementations keep the keys in Postgres (or Valkey), so a retry gets the same answer on any instance.

A retry that arrives while the first request is still running waits for its response, or gets a `409` if the wait runs out. A key reused on a different request gets a `422` instead of the other request's response. If a server crashes mid-request, its claim on the key is a lease, and a waiting request takes over once it runs out.

Every implementation follows one [specification](./SPEC.md), which covers the hashes, what goes in the store, and the notification that wakes a waiting request. The [interop e2e](../../e2e/idempotency-keys-interop/) runs a TypeScript server and a Go server on every store and notifier, and checks that each one replays, waits on, takes over and rejects the other's requests.

Use the Postgres store when a duplicate would really hurt, since it keeps keys durably. Valkey works too, but a failover can make it forget a key. Notifications, through either store or neither, only make waiting faster.

Guides and the full reference are on the [docs site](https://jacobley.github.io/leyman/packages/idempotency-keys/).

## Packages

| Package | Status |
|---------|--------|
| [`ts`](./ts/) | The TypeScript implementation, published to npm as [`idempotency-keys`](https://www.npmjs.com/package/idempotency-keys) |
| [`go`](./go/) | The Go implementation, with `net/http` middleware, released as the Go module `github.com/JacobLey/leyman/tools/idempotency-keys/go` |
| [`test-vectors`](./test-vectors/) | The scenarios and hashes every implementation passes, in this repository only |
