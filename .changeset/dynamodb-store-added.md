---
'idempotency-keys': minor
---

Add a DynamoDB store, `DynamoDbStore` from `idempotency-keys/dynamodb`, with `createTableInput()` and `updateTimeToLiveInput()` for its table. It takes the `DynamoDB` client of `@aws-sdk/client-dynamodb` and adds no dependency. Its layout is the one of spec 1.1, so it shares keys with the Go package's DynamoDB store. Its times come from each server's clock, so `leaseMs` must cover clock drift between servers, and an item holds at most 400 KB, so a larger response fails to complete.
