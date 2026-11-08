---
description: The idempotency-keys specification in brief, what every implementation shares (status codes, the replay header, hashes, rows and notifications), and the interop e2e that checks TypeScript and Go servers serve one set of keys.
---

# Specification

Every implementation of idempotency-keys follows one [specification](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md): the hashes, what goes in the store, and the notification that wakes a waiting request. So servers in different languages on the same store and notifier serve one set of keys, as if they were one server. This page summarizes it for readers; the specification itself is the reference for writing an implementation.

## On the wire

| Status | When                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| `400`  | The `Idempotency-Key` header can't be read, or the server requires a key for the operation and the request has none. |
| `409`  | A request with the key is still running, and waiting for it ran out.                                                 |
| `422`  | The key was used on a different request.                                                                             |

These are the status codes of the IETF draft [The Idempotency-Key HTTP Header Field](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07) (draft 07). A replay has the first response's status, headers and body, plus `Idempotent-Replayed: true`. A request without a key runs as it would without the library.

A key is 1 to 255 characters from `0x20` to `0x7E`. A quoted value is a Structured Field String, and the key is its content; any other value is the key as it is.

## Hashes

Two SHA-256 hashes, written out as 64 lower-case hex characters:

- The **identity** of `(scope, operation, key)` says which record a request claims.
- The **fingerprint** of the method, the request target, the headers the server names and the body says whether a reused key is on the same request.

Each is a sequence of length-prefixed fields, so no two inputs hash the same by running fields together, and an absent operation never equals an empty one. The target is the path and query as a WHATWG URL serializes them (as `fetch`'s `Request.url` holds them), so a Go server, which gets the raw target, hashes `/a/../notes` and `/notes` as one request, as a TypeScript server does.

## What is stored

Each identity has at most one record: **running** (claimed by one request, with a random token and a lease) or **completed** (with a response). A request claims it, compares fingerprints, then waits or replays; the request that ran ends its attempt by completing (storing the response) or releasing (deleting the record), and either only applies while the record still holds its token.

In Postgres, the record is a row of one table:

```sql
CREATE TABLE idempotency_keys (
    identity bytea PRIMARY KEY,
    fingerprint bytea NOT NULL,
    token text,
    lease_expires_at timestamptz,
    expires_at timestamptz NOT NULL,
    status smallint,
    headers jsonb,
    body bytea
);
```

In Valkey, it is a hash at `<prefix>:<identity>`, with fields `fingerprint`, `token` and `lease` while running, and `status`, `headers` and `body` once completed, written by Lua scripts every implementation sends byte for byte.

A response's headers are stored as a JSON array of `[name, value]` pairs, names in lower case, without the headers a server recomputes for every response (`content-length`, `transfer-encoding`, `connection`, `keep-alive`). Every time comes from the store's clock.

## Notifications

After every successful complete or release, a server publishes the identity on one channel (`idempotency_keys` by default): `PUBLISH` in Valkey, `pg_notify` in Postgres. Servers listening wake their requests waiting on that identity, which claim again from the store. A notification is never the source of truth: waiting requests poll regardless.

## Interop

The [test vectors](https://github.com/JacobLey/leyman/tree/main/tools/idempotency-keys/test-vectors) pin every hash and every scenario, and each implementation passes them against every store. The [interop e2e](https://github.com/JacobLey/leyman/tree/main/e2e/idempotency-keys-interop) checks the promise end to end: it runs a TypeScript server (on `handle()`) and a Go server (on `Keys.Middleware`) as child processes on one store and notifier, and sends every request across from one to the other, in both directions.

| Store    | Notifiers              |
| -------- | ---------------------- |
| Postgres | Postgres, Valkey, none |
| Valkey   | Valkey, none           |

On each, it checks that one server replays the other's response without running the handler; that a duplicate sent to the other server waits and gets the same response, woken by a notification when there is a notifier; that it gets a `409` when its wait runs out; that the key on another body is a `422`; that once one server is killed mid-request and its lease runs out, the other runs the request; that a `429` on one frees the key for the other; and that a request target sent raw to one server and normalized to the other is one request.

To run it, with the Postgres and Valkey sidecars of the devcontainer and Go installed:

```sh
nx run @leyman/e2e-idempotency-keys-interop:test
```
