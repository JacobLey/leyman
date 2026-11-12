---
description: Keep idempotency keys in any database by implementing IdempotencyStore, walked through point by point against the store contract with a small in-memory store.
---

# Writing a store

Postgres and Valkey are the stores that ship, but the keys can live in any database that every server reaches: DynamoDB, MongoDB, SQLite on one machine, or a key-value service of your platform. `store` takes anything implementing `IdempotencyStore`.

A store does less than it might seem. The library computes the hashes, waits on running requests, applies the respond policy, notifies other servers and checks every response before storing it. A store only keeps one record per identity, with three operations:

- `claim(params)` returns `claimed` when the record is absent, expired, or running past its lease with the same fingerprint, and writes a new running record holding `params.token`. Otherwise it returns `running` with the record's fingerprint, or `completed` with its fingerprint and response.
- `complete(identity, token, response)` stores the response if the record still holds `token`, and says whether it did.
- `release(identity, token)` deletes the record if it still holds `token`, and says whether it did.

What each must guarantee is the specification's [store contract](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md#the-store-contract). Below is a store that keeps it, then how it does, point by point.

## An in-memory store

This store keeps its records in a `Map` of one process. It is the store the package's own tests run every [test vector](https://github.com/JacobLey/leyman/tree/main/tools/idempotency-keys/test-vectors) against, alongside Postgres and Valkey, and the code below is that file. Each record is kept as JSON, as an external store would hold it, so nothing is shared by reference, and each operation first waits a couple of milliseconds, as a round trip would, so a claim and its complete really are apart in time.

<<< @/../../tools/idempotency-keys/ts/test/helpers/memory-store.ts

It isn't one to deploy: a second instance has a `Map` of its own, and a restart forgets every key. It is the shape a real store follows.

## The contract, point by point

**Each operation is atomic for its identity.** Of two concurrent claims on a free key, exactly one may get `claimed`. Here, nothing awaits between reading a record and writing it, and JavaScript runs one piece of code at a time, so no other operation can run in between. A store on a database gets the same from a transaction, a single conditional write (a compare-and-set, or `INSERT ... ON CONFLICT` as the Postgres store does), or a script the database runs alone (as the Valkey store does). Reading in one request and writing in another, without a condition on the write, is the mistake to avoid: two servers both read "absent" and both claim.

**A takeover only happens with a matching fingerprint.** `isTakeover` needs a running record whose lease has run out _and_ the same fingerprint. A request with another fingerprint gets `running`, which the library answers with a `422`, so a key reused on a different request never takes over the first one's record.

**Reads see every completed write.** A claim after a `complete` or `release`, from any server, must see it. One `Map` does trivially. A database with eventually consistent reads (DynamoDB, a replica) must use its strongly consistent ones.

**A record past its `ttlMs` counts as absent**, to every operation. `#read` returns nothing for an expired record, so a claim writes over it, and `complete` and `release` find no token. The record itself stays in the `Map` until then: a store may delete expired records later, or never, as the Postgres store does without `deleteExpired()`. A lease or key has run out once its end time is reached, so the comparisons are `<= now` for running out and `> now` for still valid.

**Completing and releasing check the token.** A request whose lease ran out and was taken over still calls `complete` or `release` when it finishes. Its token is gone, so the store changes nothing and returns `false`, and the library answers that attempt `lost`. A completed record holds no token at all, so nothing can release it.

**Times are measured on one clock.** Every lease and expiry here is `Date.now()`, one process's clock. The built-in stores use the database's (`clock_timestamp()`, `TIME`), so servers with drifting clocks agree on every lease. A store on a database without a clock may take the servers' time, as this one does. Then a server whose clock runs ahead can take over a lease early, so set `leaseMs` above the slowest handler plus the worst drift between servers.

**A failure is an error, never an answer.** When the database can't be reached, the operation must reject, not return `false` or `running`. The request then fails rather than running unprotected. A store may also reject a response it can't hold (too large for an item, say): the attempt is left to its lease, like one that failed before it had a response. This store never fails, so it never rejects.

**Its durability is stated.** A store that can lose a record (a cache that evicts, a failover that drops writes) lets a request after the loss run again. Say so in its documentation, as the Valkey store's does. This one loses everything on a restart, which is why it's an example.

Finally, a store keeps the identity, fingerprint, token and response exactly as given. The body is bytes, so this store writes it as a list of numbers, and gives it back as a `Uint8Array`.

## Testing it

Run your store through the test vectors' scenarios, as the package's [vector tests](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/ts/test/integration/vectors.spec.ts) do for every store: each scenario builds `IdempotencyKeys` on a fresh store with the scenario's options, then begins, responds and releases as its steps say, checking every outcome. The scenarios cover concurrent claims, takeovers, expiry and mismatched fingerprints, which are where a store goes wrong.

## Sharing keys across languages

How a store lays out its records is its own. A TypeScript server and a [Go](/packages/idempotency-keys/guides/go) server share keys through a store only if both write the same layout, which the specification pins byte for byte for Postgres and Valkey. A store of your own is shared across languages once each language implements it.
