# idempotency-keys-go

## 0.3.0

- The new `dynamodb` package is the spec's DynamoDB store, on the AWS SDK for Go v2: `NewStore` takes a `*dynamodb.Client` (or anything with its `PutItem`, `UpdateItem` and `DeleteItem`), and `CreateTableInput` and `UpdateTimeToLiveInput` give the requests that create its table and turn on Time to Live. It is strict, like the Postgres store, and uses the servers' clocks, so the lease has to cover clock drift between them. A response too big for a 400 KB item is an error when completing. It shares keys with the TypeScript package's `DynamoDbStore`.
- `Attempt.Renew(ctx)` renews an attempt's lease, so a request that runs longer than the lease (a job with a heartbeat) keeps its key: the lease runs out `WithLease` from the renewal, and the key expires `WithTTL` from it. It returns false when another request took over, the attempt ended or the key expired. All three built-in stores renew, through the new optional `Renewer` interface, so a `Store` a server brings still compiles; renewing on one that isn't a `Renewer` returns an error matching the new `ErrRenewUnsupported`.
- `SpecVersion` is `"1.1"`, which adds the DynamoDB layout and lease renewal. Servers on 1.0 share keys with it as before, and never renew.

## 0.2.1

- `Handle` stores a response's headers in a fixed order: by lower-case name in byte order, as documented, and names that differ only in case (which a handler can only set by writing to the header map directly) by their bytes, instead of in whatever order the map gave them.

## 0.2.0

- `SpecVersion` is the version of the idempotency-keys specification the module implements (`"1.0"`). The specification is now versioned as `major.minor`, and servers whose implementations share a major version share keys.
- Breaking: `Attempt.Respond` with a response a replay couldn't send (a status outside 200 to 599, or a body on a `204`, `205` or `304`) returns an error matching the new `ErrUnsendableResponse` instead of `RespondRefused`, which is removed. As before, the policy isn't asked, the store isn't touched, and the attempt still holds the key. `Handle` still sends the response, and now reports the error to `WithOnError`.
- `Store` is documented as an extension point, written to the spec's new store contract, with an in-memory example store in the package docs that the tests run through every scenario.
- The Postgres store's `Release` of a key that expired (its request outlived the TTL, and nobody took over) returns false and leaves the row to `DeleteExpired`, as the Valkey store does, since an expired record counts as absent.

## 0.1.0

- First release: the Go implementation of idempotency-keys, with `net/http` middleware and the Postgres and Valkey stores and notifiers, held to the same test vectors as the TypeScript package and sharing its keys.
