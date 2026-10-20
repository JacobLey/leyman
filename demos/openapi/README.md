# OpenAPI demo

A deliberately small API (notes: add one, read one, list the newest), with the whole path from spec to database built properly, because the plumbing is the point:

```
spec (juniper) ──► openapi.json ──┬──► client: genever types + a typed fetch client
                                  └──► server: genever types + Hono, validating against openapi.json
                                                └──► Postgres: Drizzle migrations ──► schema.sql ──► pg-dolly per test
```

Worked examples, not packages: none is published. Each is a full package (lint, types, 100% coverage), and the server's tests run against the real `postgres` sidecar.

| Package | Output | README |
|---|---|---|
| [`spec`](./spec) | `openapi.json`, built from Juniper schemas | [What the spec says, and how it is checked](./spec/README.md) |
| [`client`](./client) | A typed client, from `openapi.json` | [How the types and routes come from the spec](./client/README.md) |
| [`server`](./server) | The service: Hono on Postgres | [Validation, authentication, the database and its tests](./server/README.md) |

## Why each piece

- **The spec is the contract, and the one source of truth.** It's written in TypeScript with [Juniper](../../apps/juniper), whose schemas carry their types, and `serializeSpec` turns it into a plain `openapi.json` (OpenAPI 3.1). That file is committed, and CI fails if it's stale (`populate-files`). Both sides read the file, as any outside client would, never the TypeScript.
- **Types are generated from the file, on each side.** [genever](../../apps/genever) writes `Paths` and `Operations` types into each package's `src/generated/`, from the spec package's `openapi.json` as installed. A change to the spec that breaks a handler or a call is a type error in that package.
- **The server checks every request and response against the document at runtime**, with Ajv compiled from `openapi.json`. Types only hold within TypeScript; the network is where the contract is actually kept.
- **The database schema is what the migrations build.** Drizzle generates SQL migrations, [`pg-dolly-schema`](../../apps/pg-dolly-schema) dumps what they build into `schema.sql`, and every test gets a database of its own cloned from it with [`pg-dolly`](../../tools/pg-dolly).

## What was learned

- **Nx expands `$` in a target's options.** Options are forwarded to the command in double quotes, so a migrate command containing `$DATABASE_URL` would run against the server's default database. The migrate command is set in `env` instead.
- **drizzle-kit doesn't declare what it imports.** It loads `drizzle-orm` and the `pg` driver from its own install location, which pnpm's strict layout doesn't allow. A `packageExtensions` entry in `pnpm-workspace.yaml` makes them peers.
- **`drizzle-kit migrate` adds its own bookkeeping** (`drizzle.__drizzle_migrations`), so `schema.sql` has it too. That's accurate: every real database has it.
- **drizzle-kit has no check-only mode** for "the schema has changes no migration covers". `scripts/nx/drizzle-kit-check.sh` generates into the real directory, compares, and puts it back.
- **Fastify was the other option.** It validates requests natively from per-route schemas, but its response schemas only drive serialization (dropping unknown fields), not validation. With Hono, both directions are explicit middleware against the document.

## Not covered

- Optional request bodies, other content types, header and cookie parameters, and response headers. The spec has none, so the server has no code for them.
- Pagination beyond a `limit` (cursors), rate limiting, CORS, and real token issuance (JWT, OAuth). Authentication is a fixed list of bearer tokens behind an `Authenticator` binding, which is where those would plug in.
- Spec linting beyond the spec package's own tests (e.g. [Spectral](https://github.com/stoplightio/spectral)).
- The cost of validating every response in production. It catches a handler breaking the contract before a client does, but a busy service might only sample.
