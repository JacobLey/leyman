# idempotency-keys specification

This document describes what every implementation of idempotency-keys does, and everything two implementations have
to agree on: the hashes, what they write to a store, and the notification that wakes a waiting request. Because both
follow it, a TypeScript server and a Go server on the same store and notifier serve one set of keys as if they were one
server. The [test vectors](./test-vectors/) pin every hash and every scenario below, and an implementation must pass
all of them against every store it ships. The [interop e2e](../../e2e/idempotency-keys-interop/) runs a server in each
language on every store and notifier, and drives them against each other.

A server may also bring its own store, written to the [store contract](#the-store-contract). Two servers interoperate
through a store only when both write the same layout: the [Postgres](#postgres) and [Valkey](#valkey-or-redis) layouts
below are pinned byte for byte, so every implementation's built-in stores interoperate, while a custom store is shared
across languages only if each language implements its layout.

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
integer, then its bytes. Strings are UTF-8, and `scope`, `operation` and `key` must be well-formed Unicode (no lone
surrogates). An absent value is the length `0xFFFFFFFF` with no bytes, so it never
equals an empty one.

```
identity    = SHA-256( field(scope) || field(operation, or absent) || field(key) )
fingerprint = SHA-256( field(method) || field(target) || uint32(count) || headers || field(body) )
headers     = for each named header, in byte order of its name: field(name) || field(value, or absent)
```

- `method` is as received, except that `DELETE`, `GET`, `HEAD`, `OPTIONS`, `POST` and `PUT` are upper-cased in any
  case, as `fetch` does when it builds a `Request` ([Fetch, normalize a method][normalize]). Other methods are
  case-sensitive (`patch` is not `PATCH`), as HTTP says ([RFC 9110, section 9.1][methods]).
- `target` is the path and query as a WHATWG URL serializes them ([URL Standard][url]): the request's origin and
  raw target concatenated (`http://host` + `//notes`, not `//notes` resolved as a relative URL) and parsed, then its path, plus `?` and its query when the query isn't empty, without the fragment. So `/notes?` is `/notes`,
  `/a/../notes` is `/notes`, `/café` is `/caf%C3%A9`, `/a b` is `/a%20b` and `/notes\sub` is `/notes/sub`, while a
  percent-encoding already there stays as it is (`/notes/%61` is not `/notes/a`). `fetch`'s `Request.url` is already
  this; other servers parse the raw target with a WHATWG URL parser. An absolute-form target, whose scheme is `http`
  or `https` in any case (`http://host/notes`, which a server must accept: [RFC 9112, section 3.2.2][absolute-form]), is
  parsed alone instead, so it hashes as its origin-form does, as `Request.url` holds it.
- Header names are lower case. Each name is listed once, so `count` is the number of distinct names. A header sent more
  than once has its values joined by `, ` in the order received (as both `fetch`'s `Headers` and Go's `Header.Values`
  give them). A named header the request doesn't have is absent. A value is hashed as the bytes received; `fetch`'s
  `Headers` gives each byte as one character from `U+0000` to `U+00FF`, so it is encoded back one byte per character,
  not as UTF-8.
- `body` is the raw bytes. A request without a body has an empty one.

Written out, both are lower-case hex: 64 characters.

[absolute-form]: https://www.rfc-editor.org/rfc/rfc9112#section-3.2.2
[normalize]: https://fetch.spec.whatwg.org/#concept-method-normalize
[methods]: https://www.rfc-editor.org/rfc/rfc9110#section-9.1
[url]: https://url.spec.whatwg.org/#concept-basic-url-parser

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

   A response a replay couldn't send can't be completed (see [Stores](#stores)): ending an attempt with one is an
   error, raised before the response policy is asked and before the store is touched, so the attempt still holds the
   key, to end again with another response or release.

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

Every lease and expiry is measured on one clock that all servers agree on. The built-in stores use their own (Postgres
`clock_timestamp()`, Valkey `TIME`), so servers with drifting clocks still agree on every lease. A store without a clock
of its own may use the servers' clocks; then a server whose clock runs ahead can take over a lease early, so `leaseMs`
must cover the slowest handler plus the worst drift between servers, and a key may expire early by as much as that
drift.

### Options

| Option | Default | Meaning |
|---|---|---|
| `ttlMs` | 86 400 000 (24 hours) | How long a key lasts, from when it was claimed. A takeover claims it again, so a key never expires while its request runs. |
| `leaseMs` | 60 000 | How long a request may run before it is taken to have crashed and another may take over. Longer than the slowest handler, so a slow request never runs twice. |
| `waitMs` | 10 000 | How long a request waits on a running one before a `409`. `0` answers at once. |

`leaseMs` must be less than `ttlMs`. Polling (how often a waiting request claims again without a notification) is up to
each implementation: it is the fallback for a lost notification, so it only affects how quickly a waiter notices.

## Stores

Each store implements three operations. `token` is 16 random bytes, as 32 lower-case hex characters, new for every
claim and takeover.

- `claim(identity, fingerprint, token, leaseMs, ttlMs)` returns `claimed`, `running` with the record's fingerprint, or
  `completed` with its fingerprint and response, as in step 1. A takeover only happens with a matching fingerprint: a
  mismatch must answer `422` without disturbing the request that holds the record.
- `complete(identity, token, response)` stores the response if the record holds `token`, and says whether it did.
- `release(identity, token)` deletes the record if it holds `token`, and says whether it did.

### The store contract

What any store, built in or brought by a server, must guarantee. The implementation does everything else (hashing,
waiting, the response policy, notifying), so a store only keeps records.

- **Each operation is atomic for its identity.** Two operations on one identity, from any servers, behave as if one ran
  entirely before the other: of two concurrent claims on a free key, exactly one gets `claimed`. A store gets this from a
  transaction, a single conditional write (compare-and-set), or a script the store runs alone. Operations on different
  identities don't interact.
- **Reads see every completed write.** A claim that follows a `complete` or `release` (from any server) sees it. A store
  with eventually consistent reads must use its strongly consistent ones.
- **A record past its `ttlMs` counts as absent**, to every operation, from the moment it expires: a claim writes over
  it, and `complete` and `release` find no token. Deleting it may happen later, or never. A lease or key has run out
  once its end time is reached (the end is at or before now), so a takeover at that instant succeeds.
- **Times are measured on one clock**, as in [Attempts](#attempts): the store's own, or the servers'.
- **A failure is an error, never an answer.** A store that can't be reached or can't write raises it, and the request
  fails rather than running unprotected. A store may refuse a response it can't hold (too large, say) the same way: the
  attempt is left to its lease, like one that failed before it had a response.
- **Its durability is stated.** A store that can lose a record (a cache that evicts, a failover that drops writes) lets
  a request after the loss run again, and its documentation says so, as the Valkey store's does.

A store keeps the identity, fingerprint, token and response exactly as given. How it lays them out is its own, unless
servers in more than one language share it (see the introduction).

### Responses

A response is a status (an integer from 200 to 599), headers, and a body (bytes). A `204`, `205` or `304` has an
empty body. Any other response can't be completed, as `fetch` can't build it, so a replay couldn't send it: ending an
attempt with one is an error, and the store is never asked to store it (see [Attempts](#attempts)). Headers are `[name, value]`
pairs of strings, names in lower case, in the order the server's response lists them, repeated names kept. Each byte of
a value is one character from `U+0000` to `U+00FF`, as `fetch`'s `Headers` gives it, and a replay sends each character
back as that byte, in that order, plus `Idempotent-Replayed: true`. The built-in layouts store them as a JSON array of
those pairs (so a byte `0xE9` is stored as `é`, encoded in the JSON as UTF-8). The headers a server recomputes for every
response it sends (`content-length`, `transfer-encoding`, `connection`, `keep-alive`) and any `idempotent-replayed`
are never stored.

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

The table's name is configurable (one identifier, quoted, so case-exact, and at most 63 bytes, Postgres's limit;
no schema qualification: set the client's `search_path`); its columns are not. `identity` and `fingerprint` are the 32-byte digests. A running
row has `token` and `lease_expires_at`, and no response. A completed row has `status`, `headers` and `body`, and `token`
and `lease_expires_at` are null. A row whose `expires_at` has passed counts as no row. Postgres doesn't expire rows on
its own: run each implementation's `deleteExpired` from a scheduled job, or leave them to be overwritten.

Every time is Postgres's `clock_timestamp()`, the time of the statement, not `now()`, which is the time its
transaction started (a client inside a long transaction would write leases already run out). A claim is one statement:

```sql
INSERT INTO idempotency_keys (identity, fingerprint, token, lease_expires_at, expires_at)
VALUES ($1, $2, $3, clock_timestamp() + $4 * interval '1 millisecond', clock_timestamp() + $5 * interval '1 millisecond')
ON CONFLICT (identity) DO UPDATE
    SET fingerprint = excluded.fingerprint, token = excluded.token,
        lease_expires_at = excluded.lease_expires_at, expires_at = excluded.expires_at,
        status = NULL, headers = NULL, body = NULL
    WHERE idempotency_keys.expires_at <= clock_timestamp()
       OR (idempotency_keys.lease_expires_at <= clock_timestamp() AND idempotency_keys.fingerprint = excluded.fingerprint)
RETURNING token
```

A returned row is a claim. No row returned means the record stays: read it to answer `running` (no `status`) or
`completed`, and claim again if the read finds no row (it was released or expired in between):

```sql
SELECT fingerprint, status, headers, body FROM idempotency_keys
WHERE identity = $1 AND expires_at > clock_timestamp()
```

Completing and releasing check the token in the statement, and that the key hasn't expired, as a Valkey key that
expired is gone:

```sql
UPDATE idempotency_keys SET status = $3, headers = $4, body = $5, token = NULL, lease_expires_at = NULL
WHERE identity = $1 AND token = $2 AND expires_at > clock_timestamp()

DELETE FROM idempotency_keys WHERE identity = $1 AND token = $2 AND expires_at > clock_timestamp()
```

A request whose lease ran out, but that nobody took over, still completes or releases: its token is still there.
`deleteExpired` is `DELETE FROM idempotency_keys WHERE expires_at <= clock_timestamp()`.

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

Each operation is one Lua script, run with `EVAL` on one key, `KEYS[1]` the record, which every implementation sends
byte for byte (they are in the test vectors). Being one key, a record lives on one node of a cluster. Arguments are
strings, numbers in decimal:

| Script | `ARGV` | Reply |
|---|---|---|
| claim | fingerprint, token, `leaseMs`, `ttlMs` | `{'claimed'}`, `{'running', fingerprint}`, or `{'completed', fingerprint, status, headers, body}` (`status` a decimal string) |
| complete | token, status, headers, body | `1` if it stored the response, `0` if the record doesn't hold the token |
| release | token | `1` if it deleted the record, `0` if it doesn't hold the token |

`body` is binary: read the reply as bytes, not text (a client that decodes replies as UTF-8 changes a binary body).

## Notifiers

A notifier only wakes waiting requests sooner. It is never the source of truth: a waiter claims again from the store
when woken, and polls without it, so a notifier that is down or loses a message only makes waiters slower. Valkey is
never the store's source of truth through its notifier, only the Postgres store's doorbell.

After every successful `complete` and `release`, the request publishes the identity (64 hex characters) on one channel,
named `idempotency_keys` unless configured (in Postgres a quoted identifier, so case-exact, at most 63 bytes). Every server listening on it wakes its requests waiting on that identity.

- **None**: polling only.
- **Valkey pub/sub**: `PUBLISH <channel> <identity>`.
- **Postgres**: `NOTIFY` on the channel (`SELECT pg_notify($1, $2)`), heard with `LISTEN`. A notification is delivered
  when its transaction commits, after the write it announces.

Any notifier works with any store.
