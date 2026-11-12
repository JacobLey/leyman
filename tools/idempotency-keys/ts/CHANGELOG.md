# idempotency-keys

## 0.2.0

### Minor Changes

- d072893: Bring your own store. The specification now states the store contract that any `IdempotencyStore` must keep (atomic per identity, reads see every completed write, an expired record is absent, one clock, failures reject, durability stated), and the docs walk through an in-memory store that keeps it.
  
  Breaking changes:
  
  - The Postgres and Valkey adapters moved to subpath exports. Import `PostgresStore`, `PostgresNotifier`, `createTableSql` and their types from `idempotency-keys/postgres`, and `ValkeyStore`, `ValkeyNotifier` and their types from `idempotency-keys/valkey`. `IdempotencyKeysReplyError`, which only `ValkeyStore` throws, moved with it. The root `idempotency-keys` keeps the protocol, `handle()`, the hashes, the other errors and the interfaces.
  - `attempt.respond()` with a response a replay couldn't send (a status that isn't a whole number from 200 to 599, or a body on a `204`, `205` or `304`) rejects with the new `IdempotencyKeysResponseError` instead of resolving to `'refused'`, which is gone from `RespondResult`. It still rejects before the policy or the store, so the attempt holds the key. `handle()` reports it to `onError` and returns the response, as for a store failure.
  
  `PostgresStore`'s `release` now returns `false` for a record past its `ttlMs`, as `ValkeyStore`'s already did.
  
  `handle()` sends a handler's `Response.error()` as a network error, instead of rejecting with a `RangeError` when it rebuilt the response.
- 822e6e2: Export `SPEC_VERSION`, the version of the language-independent specification the package implements (`'1.0'`). The specification is now versioned as `major.minor`: implementations that share a major version share keys (idempotency-keys) or buckets (constant-consistent-hash).

## 0.1.2

### Patch Changes

- 0d51717: Hash a `^` in the request path as `%5E` on every Node.js version. The WHATWG URL serialization encodes it, but Node.js 22.12's `URL` doesn't, so the same request hashed differently on the lowest supported Node.js than on newer ones.

## 0.1.1

### Patch Changes

- 1e6aa0a: Rewrite the README introduction to explain the problem before the package, and simplify the description.

## 0.1.0

### Minor Changes

- 6580fbb: First release: `Idempotency-Key` handling for HTTP writes. A request with a key runs once across every instance on the same store; a duplicate waits for it (or gets a `409`), a retry replays its response, and a key reused on a different request is a `422`. `handle()` works over fetch's `Request` and `Response`, and `begin()` with any framework. Stores on Postgres (strict) or Valkey (lax), and notifiers through Postgres `LISTEN`/`NOTIFY` or Valkey pub/sub, all taking your own clients. Hashes, rows and notifications follow the language-independent idempotency-keys spec.

### Patch Changes

- cac2408: Point the package's homepage at its new docs site pages, which have guides and the full reference, and link them from the README.
