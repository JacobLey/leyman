---
"idempotency-keys": minor
---

Bring your own store. The specification now states the store contract that any `IdempotencyStore` must keep (atomic per identity, reads see every completed write, an expired record is absent, one clock, failures reject, durability stated), and the docs walk through an in-memory store that keeps it.

Breaking changes:

- The Postgres and Valkey adapters moved to subpath exports. Import `PostgresStore`, `PostgresNotifier`, `createTableSql` and their types from `idempotency-keys/postgres`, and `ValkeyStore`, `ValkeyNotifier` and their types from `idempotency-keys/valkey`. The root `idempotency-keys` keeps the protocol, `handle()`, the hashes, the errors and the interfaces.
- `attempt.respond()` with a response a replay couldn't send (a status that isn't a whole number from 200 to 599, or a body on a `204`, `205` or `304`) rejects with the new `IdempotencyKeysResponseError` instead of resolving to `'refused'`, which is gone from `RespondResult`. It still rejects before the policy or the store, so the attempt holds the key. `handle()` reports it to `onError` and returns the response, as for a store failure.

`PostgresStore`'s `release` now returns `false` for a record past its `ttlMs`, as `ValkeyStore`'s already did.
