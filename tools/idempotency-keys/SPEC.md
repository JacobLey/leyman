# idempotency-keys specification

What every implementation of idempotency-keys does, and everything two of them share: the hashes, what they write to a
store, and the notification that wakes a waiting request. A TypeScript server and a Go server on the same store and
notifier serve one set of keys as if they were one server. The [test vectors](./test-vectors/) pin every hash and every
scenario below; an implementation passes them all, against every store.

Status codes follow the IETF draft [The Idempotency-Key HTTP Header Field][draft] (draft 07): `400` for a key that
can't be read, `409` for a request whose key is in use, and `422` for a key reused on a different request.

[draft]: https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07

## Requests

A request carries its key in the `Idempotency-Key` header. A request without one runs as it would without the library,
unless the server requires a key for that operation: then it is a `400`.

- **The key** is the header's value, with the values of a repeated header joined by `, ` in the order received
  ([RFC 9110, section 5.3][combining]: `fetch`'s `Headers` only ever gives them joined). A value in quotes is a
  Structured Field String ([RFC 9651, section 3.3.3][sf-string]), and the key is its content, without the quotes and
  escapes. Any other value is the key as it is, and can't contain a comma, so a repeated header is always a `400`. A key
  is 1 to 255 characters, each from `0x20` (space) to `0x7E`. Anything else is a `400`.
- **The identity** is `(scope, operation, key)`. The server gives `scope` (who is calling: a user or tenant id, never
  empty) and, optionally, `operation` (any non-empty string it picks: an OpenAPI `operationId`, a route name). With an
  operation, a key on another operation is another key. Without one, a key is one key across everything the scope
  calls, so reusing it on another endpoint is a `422`.
- **The fingerprint** is what a reused key must match: the method, the request target (the path and query, as
  received), the headers the server names, and the body.

[sf-string]: https://www.rfc-editor.org/rfc/rfc9651#section-3.3.3
[combining]: https://www.rfc-editor.org/rfc/rfc9110#section-5.3

### Encoding

Both hashes are SHA-256 over a sequence of fields. A field is its length in bytes as a 32-bit big-endian unsigned
integer, then its bytes. Strings are UTF-8. An absent value is the length `0xFFFFFFFF` with no bytes, so it never
equals an empty one.

```
identity    = SHA-256( field(scope) || field(operation, or absent) || field(key) )
fingerprint = SHA-256( field(method) || field(target) || uint32(count) || headers || field(body) )
headers     = for each named header, in byte order of its name: field(name) || field(value, or absent)
```

- `method` is as received, except that `DELETE`, `GET`, `HEAD`, `OPTIONS`, `POST` and `PUT` are upper-cased in any
  case, as `fetch` does when it builds a `Request` ([Fetch, normalize a method][normalize]). Other methods are
  case-sensitive (`patch` is not `PATCH`), as HTTP says ([RFC 9110, section 9.1][methods]).
- `target` is the path and query exactly as the request line had them (`/notes?draft=1`), not decoded or normalized.
- Header names are lower case. Each name is listed once, so `count` is the number of distinct names. A header sent more
  than once has its values joined by `, ` in the order received (as both `fetch`'s `Headers` and Go's `Header.Values`
  give them). A named header the request doesn't have is absent.
- `body` is the raw bytes. A request without a body has an empty one.

Written out, both are lower-case hex: 64 characters.

[normalize]: https://fetch.spec.whatwg.org/#concept-method-normalize
[methods]: https://www.rfc-editor.org/rfc/rfc9110#section-9.1

## Attempts

Each identity has at most one record in the store. A record is either **running** (claimed by one request, holding its
token and lease) or **completed** (holding a response). A request goes through these steps:

1. **Claim.** With no record, or one whose key has expired, the request writes a running record and runs. With a running
   record whose lease has expired and whose fingerprint matches, it takes the record over, under a new token, and runs.
   Otherwise the record stays as it is. A store that can't be reached fails the request: it never runs unprotected.
2. **Compare.** If the record (running or completed) has another fingerprint: `422`. This comes before waiting, so a
   mismatch never waits.
3. **Wait or replay.** A completed record's response is replayed: its status, headers and body, plus the header
   `Idempotent-Replayed: true`. A running record is waited on: the request claims again whenever the notifier says the
   identity changed, and polls on its own as well, until it claims, replays, or `waitMs` runs out (a `409`).
4. **Finish.** The request that ran ends its attempt with one of:
   - **complete**: its response is stored, and replayed to every later request with the key;
   - **release**: the record is deleted, and the next request with the key runs.

   Either only applies while the record still holds the request's token. One whose lease ran out and was taken over
   finds its token gone: its own caller still gets its response, but it isn't stored (the request that took over will
   store its own).

Which responses complete and which release is up to the server, as a function of the response. The default completes
every response except a `429` (Too Many Requests, which says nothing was done). A server that knows its handlers are
transactional may release `5xx` responses too, so a retry runs again; a handler that may have partly written must not.
A request that fails before it has a response (its server crashed, or it lost its store) neither completes nor
releases: its lease runs out, and a waiting or later request takes over. One that has a response but fails to complete
or release it still sends that response to its caller, who then has no reason to retry, and reports the failure to the
server; its lease runs out the same way.

Times come from the store's clock, never a server's, so servers with drifting clocks agree on every lease.

### Options

| Option | Default | Meaning |
|---|---|---|
| `ttlMs` | 86 400 000 (24 hours) | How long a key lasts, from when it was claimed. A takeover claims it again, so a key never expires while its request runs. |
| `leaseMs` | 60 000 | How long a request may run before it is taken to have crashed and another may take over. Longer than the slowest handler, so a slow request never runs twice. |
| `waitMs` | 10 000 | How long a request waits on a running one before a `409`. `0` answers at once. |

`leaseMs` must be less than `ttlMs`. Polling (how often a waiting request claims again without a notification) is up to
each implementation: it is the fallback for a lost notification, so it only affects how quickly a waiter notices.

## Stores

Each store implements three atomic operations. `token` is 16 random bytes, as 32 lower-case hex characters, new for
every claim and takeover.

- `claim(identity, fingerprint, token, leaseMs, ttlMs)` returns `claimed`, `running` with the record's fingerprint, or
  `completed` with its fingerprint and response, as in step 1. A takeover only happens with a matching fingerprint: a
  mismatch must answer `422` without disturbing the request that holds the record.
- `complete(identity, token, response)` stores the response if the record holds `token`, and says whether it did.
- `release(identity, token)` deletes the record if it holds `token`, and says whether it did.

A response is a status (an integer from 100 to 599), headers, and a body (bytes). Headers are stored as a JSON array of
`[name, value]` pairs of strings, names in lower case, in the order the server's response lists them, repeated names kept. A replay sends them in that order.

### Postgres

Strict: a claim is a row written in a transaction, so it is exclusive and durable. The default.

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

The table's name is configurable; its columns are not. `identity` and `fingerprint` are the 32-byte digests. A running
row has `token` and `lease_expires_at`, and no response. A completed row has `status`, `headers` and `body`, and `token`
and `lease_expires_at` are null. A row whose `expires_at` has passed counts as no row. Postgres doesn't expire rows on
its own: run each implementation's `deleteExpired` from a scheduled job, or leave them to be overwritten.

Every time is Postgres's `now()`. A claim is one statement:

```sql
INSERT INTO idempotency_keys (identity, fingerprint, token, lease_expires_at, expires_at)
VALUES ($1, $2, $3, now() + $4 * interval '1 millisecond', now() + $5 * interval '1 millisecond')
ON CONFLICT (identity) DO UPDATE
    SET fingerprint = excluded.fingerprint, token = excluded.token,
        lease_expires_at = excluded.lease_expires_at, expires_at = excluded.expires_at,
        status = NULL, headers = NULL, body = NULL
    WHERE idempotency_keys.expires_at <= now()
       OR (idempotency_keys.lease_expires_at <= now() AND idempotency_keys.fingerprint = excluded.fingerprint)
RETURNING token
```

A returned row is a claim. No row returned means the record stays: read it (one `SELECT`) to answer `running` or
`completed`, and claim again if it was released in between. Completing and releasing check the token in the statement:

```sql
UPDATE idempotency_keys SET status = $3, headers = $4, body = $5, token = NULL, lease_expires_at = NULL
WHERE identity = $1 AND token = $2

DELETE FROM idempotency_keys WHERE identity = $1 AND token = $2
```

A request whose lease ran out, but that nobody took over, still completes or releases: its token is still there.

### Valkey (or Redis)

Lax: a claim is a key with a time to live, so a failover that loses writes or a flush forgets keys, and a request after
that runs again. Use it for deduplicating notifications or non-financial creates, never payments.

A record is a hash at `<prefix>:<identity>` (the prefix is `idempotency_keys` unless configured), expiring with the key (`PEXPIRE` of `ttlMs` at each claim). Its fields:

| Field | Value |
|---|---|
| `fingerprint` | Hex digest. |
| `token` | The holder's token, while running. |
| `lease` | When the lease runs out, in milliseconds since the epoch by the server's `TIME`, while running. |
| `status`, `headers`, `body` | The response, once completed. `headers` is the JSON array. |

Each operation is one Lua script, run with `EVAL`, which every implementation sends byte for byte (they are in the test
vectors). Being one key, a record lives on one node of a cluster.

## Notifiers

A notifier only wakes waiting requests sooner. It is never the source of truth: a waiter claims again from the store
when woken, and polls without it, so a notifier that is down or loses a message only makes waiters slower. Valkey is
never the store's source of truth through its notifier, only the Postgres store's doorbell.

After every successful `complete` and `release`, the request publishes the identity (64 hex characters) on one channel,
named `idempotency_keys` unless configured. Every server listening on it wakes its requests waiting on that identity.

- **None**: polling only.
- **Valkey pub/sub**: `PUBLISH <channel> <identity>`.
- **Postgres**: `NOTIFY` on the channel (`SELECT pg_notify($1, $2)`), heard with `LISTEN`. A notification is delivered
  when its transaction commits, after the write it announces.

Any notifier works with any store.
