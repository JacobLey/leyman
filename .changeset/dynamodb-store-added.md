---
'idempotency-keys': minor
---

Add a DynamoDB store, `DynamoDbStore` from `idempotency-keys/dynamodb`, with `createTableInput()` and `updateTimeToLiveInput()` for its table. It takes the `DynamoDB` client of `@aws-sdk/client-dynamodb` and adds no dependency. Its layout is the one of spec 1.1, so it shares keys with the Go package's DynamoDB store. Its times come from each server's clock, so `leaseMs` must cover clock drift between servers, and an item holds at most 400 KB, so a larger response fails to complete.

Add lease renewal, also from spec 1.1: `attempt.renew()` moves the lease to run out `leaseMs` from now and the key to expire `ttlMs` from now, so a long request (a job with a heartbeat) keeps its key while `leaseMs` only covers the time between renewals. It resolves to `false` once the attempt no longer holds the key (another request took over, it ended, or the key expired). `IdempotencyStore` gains an optional `renew(params)`, which every built-in store implements; on a store without it, `attempt.renew()` rejects with `IdempotencyKeysRenewUnsupportedError`.
