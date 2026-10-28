# OpenAPI demo

A deliberately small API (notes: add one, read one, list the newest), with the whole path from spec to database built properly, since connecting those parts is what the demo shows:

```
spec (juniper) ──► openapi.json, notes.openapi.yaml ──┬──► client: imported types + a typed fetch client
                                                     └──► server: imported types + Hono, validating against openapi.json
                                                            ▲ Drizzle tables, and schema.sql for pg-dolly per test
database: Drizzle migrations ──► schema.sql (what the migrations build, against Postgres)
```

Worked examples, not packages: none is published. Each is a full package (lint, types, 100% coverage), and the server's tests run against the real `postgres` sidecar.

| Package | Output | README |
|---|---|---|
| [`spec`](./spec) | `openapi.json` and `notes.openapi.yaml`, built from Juniper schemas | [What the spec says, and how it is checked](./spec/README.md) |
| [`client`](./client) | A typed client, from `openapi.json` | [How the types and routes come from the spec](./client/README.md) |
| [`database`](./database) | The Drizzle schema, its migrations, and `schema.sql` | [The schema, and what the migrations build](./database/README.md) |
| [`server`](./server) | The service: Hono on Postgres | [Validation, authentication, the database and its tests](./server/README.md) |

## Why each piece

- **The spec is the contract, and the one source of truth.** It's written in TypeScript with [Juniper](../../apps/juniper), whose schemas carry their types, and `serializeSpec` turns it into a plain `openapi.json` (OpenAPI 3.1), and the same document as `notes.openapi.yaml`. Both files are committed, and CI fails if it's stale (`populate-files`). Both sides read the files, as any outside client would, never the TypeScript.
- **Types come straight from the document, on each side.** The client and server `import type { Operations } from '@leyman/demo-openapi-spec/notes.openapi.yaml'`, and [genever-content-mapper](../../apps/genever-content-mapper), a TypeScript 7.1 content mapper, gives that import [genever](../../apps/genever)'s types as `tsc` runs. Nothing is generated or committed on either side, so nothing can go stale. A change to the spec that breaks a handler or a call is a type error in that package. It needs TypeScript 7.1 (these two packages are on its beta) and `tsc --runExternalCode`, passed only in their `tsc` targets.
- **Lint reads the same types from a declaration file.** typescript-eslint runs on TypeScript 6, which can't run content mappers. So the spec package also writes genever's types beside the document as `notes.openapi.d.yaml.ts`, which TypeScript 6 reads for the import through `allowArbitraryExtensions`. `tsc` 7.1 running the mapper ignores it. It goes once typescript-eslint can run mappers.
- **The server checks every request and response against the document at runtime**, with Ajv compiled from `openapi.json`. Types only hold within TypeScript, so the contract is checked again on the wire.
- **The database schema is what the migrations build.** Drizzle generates SQL migrations, [`pg-dolly-schema`](../../apps/pg-dolly-schema) dumps what they build into `schema.sql`, and every test gets a database of its own cloned from it with [`pg-dolly`](../../tools/pg-dolly).

## What was learned

- **Nx expands `$` in a target's options.** Options are forwarded to the command in double quotes, so a migrate command containing `$DATABASE_URL` would run against the server's default database. The migrate command is set in `env` instead.
- **drizzle-kit doesn't declare what it imports.** It loads `drizzle-orm` and the `pg` driver from its own install location, which pnpm's strict layout doesn't allow. A `packageExtensions` entry in `pnpm-workspace.yaml` makes them peers.
- **`drizzle-kit migrate` adds its own bookkeeping** (`drizzle.__drizzle_migrations`). A schema-only dump kept the table but not its rows, so a test database looked unmigrated, and migrating it would have run every migration again. `pg-dolly-schema --data` keeps its rows too.
- **drizzle-kit has no check-only mode** for "the schema has changes no migration covers". `scripts/nx/drizzle-kit-check.sh` generates into a copy of the migrations, through a temporary config that only changes `out`, and compares.
- **drizzle-kit exits 0 when it fails.** Without a terminal, it can't ask whether a column was renamed, so it prints an error, writes nothing, and exits 0. A check that only compared files would pass. The check fails on any error output instead.
- **Fastify was the other option.** It validates requests natively from per-route schemas, but its response schemas only drive serialization (dropping unknown fields), not validation. With Hono, both directions are explicit middleware against the document.

## Not covered

- Optional request bodies, other content types, header and cookie parameters, and response headers. The spec has none, so the server has no code for them.
- Pagination beyond a `limit` (cursors), rate limiting, and CORS. Tokens are issued by an authorization server (the [dev OAuth server](../../tools/oauth-dev-server) in tests); the API only verifies them.
- Spec linting beyond the spec package's own tests (e.g. [Spectral](https://github.com/stoplightio/spectral)).
- The cost of validating every response in production. It catches a handler breaking the contract before a client does, but a busy service might only sample.
