# OpenAPI demo

The notes API is deliberately small (you can add a note, read one, and list the newest). What the demo shows is how the parts connect, from the spec down to the database, so that whole path is built properly even though the API itself is tiny.

```
spec (juniper) ──► openapi.json, notes.openapi.yaml ──┬──► client: imported types + a typed fetch client
                                                     └──► server: imported types + Hono, validating against openapi.json
                                                            ▲ Drizzle tables, and schema.sql for pg-dolly per test
database: Drizzle migrations ──► schema.sql (what the migrations build, against Postgres)
```

These are worked examples, and none of them is published. Each is still a full package (lint, types, 100% coverage), and the server's tests run against the real `postgres` sidecar.

| Package | Output | README |
|---|---|---|
| [`spec`](./spec) | `openapi.json` and `notes.openapi.yaml`, built from Juniper schemas | [What the spec says, and how it is checked](./spec/README.md) |
| [`client`](./client) | A typed client, from `openapi.json` | [How the types and routes come from the spec](./client/README.md) |
| [`database`](./database) | The Drizzle schema, its migrations, and `schema.sql` | [The schema, and what the migrations build](./database/README.md) |
| [`server`](./server) | The service, Hono on Postgres | [Validation, authentication, the database and its tests](./server/README.md) |

## Why each piece

The spec is the contract, and the one source of truth. It's written in TypeScript with [Juniper](../../apps/juniper), whose schemas carry their types, and `serializeSpec` turns it into a plain `openapi.json` (OpenAPI 3.1), along with the same document as `notes.openapi.yaml`. Both files are committed, and CI fails if they're stale (`populate-files`). The client and server read those files, as any outside client would, rather than importing the TypeScript.

Each side takes its types straight from the document. The client and server `import type { Operations } from '@leyman/demo-openapi-spec/notes.openapi.yaml'`, and [genever-content-mapper](../../apps/genever-content-mapper), a TypeScript 7.1 content mapper, gives that import [genever](../../apps/genever)'s types as `tsc` runs. Nothing is generated or committed on either side, so there is nothing to go stale, and a change to the spec that breaks a handler or a call is a type error in that package. This needs TypeScript 7.1 (these two packages are on its beta). Their `tsc` targets run [trusted-tsc](../../apps/trusted-tsc), which passes `--runExternalCode` only for the mapper their `package.json` trusts, sandboxed so it can only read its own packages.

Lint reads the same types from a declaration file. typescript-eslint runs on TypeScript 6, which can't run content mappers, so the spec package also writes genever's types next to the document as `notes.openapi.d.yaml.ts`. TypeScript 6 reads that file for the import through `allowArbitraryExtensions`, and `tsc` 7.1 runs the mapper and ignores it. The file goes away once typescript-eslint can run mappers.

The server also checks every request and response against the document at runtime, with Ajv validators compiled from `openapi.json`. Types only hold inside TypeScript, so the contract is checked again on the wire.

The database schema is whatever the migrations build. Drizzle generates SQL migrations, [`pg-dolly-schema`](../../apps/pg-dolly-schema) dumps what they build into `schema.sql`, and every test gets its own database cloned from it with [`pg-dolly`](../../tools/pg-dolly).

## What was learned

- Nx expands `$` in a target's options. Options are forwarded to the command in double quotes, so a migrate command containing `$DATABASE_URL` would run against the server's default database. The migrate command is set in `env` instead.
- drizzle-kit doesn't declare what it imports. It loads `drizzle-orm` and the `pg` driver from its own install location, which pnpm's strict layout doesn't allow, so a `packageExtensions` entry in `pnpm-workspace.yaml` makes them peers.
- `drizzle-kit migrate` adds its own bookkeeping table (`drizzle.__drizzle_migrations`). A schema-only dump kept the table but not its rows, so a test database looked unmigrated, and migrating it would have run every migration again. `pg-dolly-schema --data` keeps the rows too.
- drizzle-kit has no check-only mode to find schema changes that no migration covers. `scripts/nx/drizzle-kit-check.sh` generates into a copy of the migrations, through a temporary config that only changes `out`, and compares the two.
- drizzle-kit exits 0 when it fails. Without a terminal it can't ask whether a column was renamed, so it prints an error, writes nothing, and exits 0. A check that only compared files would pass, so the check fails on any error output instead.
- Hono ignores a middleware's return value once a later handler has set `c.res`. A middleware that wraps the rest of the route (idempotency-keys' `handle()`, which reads the response to keep it and returns a copy) has to assign its response to `c.res`, or Hono sends the original, whose body has already been read.
- Fastify was the other option. It validates requests natively from per-route schemas, but its response schemas only drive serialization (dropping unknown fields) and don't validate. With Hono, both directions are explicit middleware against the document.

## Not covered

- Optional request bodies, other content types, header parameters other than `Idempotency-Key` (which the middleware reads, rather than Ajv), cookie parameters, and response headers. The spec has none of these, so the server has no code for them.
- Pagination beyond a `limit` (cursors), rate limiting, and CORS. Tokens are issued by an authorization server (the [dev OAuth server](../../tools/oauth-dev-server) in tests), and the API only verifies them.
- Spec linting beyond the spec package's own tests (e.g. [Spectral](https://github.com/stoplightio/spectral)).
- The cost of validating every response in production. It catches a handler breaking the contract before a client does, but a busy service might only sample.
