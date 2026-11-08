# idempotency-keys

## 0.1.0

### Minor Changes

- 6580fbb: First release: `Idempotency-Key` handling for HTTP writes. A request with a key runs once across every instance on the same store; a duplicate waits for it (or gets a `409`), a retry replays its response, and a key reused on a different request is a `422`. `handle()` works over fetch's `Request` and `Response`, and `begin()` with any framework. Stores on Postgres (strict) or Valkey (lax), and notifiers through Postgres `LISTEN`/`NOTIFY` or Valkey pub/sub, all taking your own clients. Hashes, rows and notifications follow the language-independent idempotency-keys spec.

### Patch Changes

- cac2408: Point the package's homepage at its new docs site pages, which have guides and the full reference, and link them from the README.
