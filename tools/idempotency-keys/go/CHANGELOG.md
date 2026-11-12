# idempotency-keys-go

## 0.2.0

- `SpecVersion` is the version of the idempotency-keys specification the module implements (`"1.0"`). The specification is now versioned as `major.minor`, and servers whose implementations share a major version share keys.
- Breaking: `Attempt.Respond` with a response a replay couldn't send (a status outside 200 to 599, or a body on a `204`, `205` or `304`) returns an error matching the new `ErrUnsendableResponse` instead of `RespondRefused`, which is removed. As before, the policy isn't asked, the store isn't touched, and the attempt still holds the key. `Handle` still sends the response, and now reports the error to `WithOnError`.
- `Store` is documented as an extension point, written to the spec's new store contract, with an in-memory example store in the package docs that the tests run through every scenario.
- The Postgres store's `Release` of a key that expired (its request outlived the TTL, and nobody took over) returns false and leaves the row to `DeleteExpired`, as the Valkey store does, since an expired record counts as absent.

## 0.1.0

- First release: the Go implementation of idempotency-keys, with `net/http` middleware and the Postgres and Valkey stores and notifiers, held to the same test vectors as the TypeScript package and sharing its keys.
