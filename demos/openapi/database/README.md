# demo-openapi-database

The Postgres schema for the OpenAPI demo, with its Drizzle tables, the migrations that build them, and a schema.sql snapshot of the result for tests to clone.

Part of the [OpenAPI demo](../README.md). It's a worked example, and isn't published.

## Contents

- [What it exports](#what-it-exports)
- [The schema](#the-schema)
- [Why a package of its own](#why-a-package-of-its-own)
- [Testing](#testing)

## What it exports

| Export                                     | What                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `notes`                                    | The Drizzle table, for queries                                                |
| `@leyman/demo-openapi-database/schema.sql` | What the migrations build, for [`pg-dolly`](../../../tools/pg-dolly) to clone |

```ts
import { readFile } from 'node:fs/promises';
import { PgDolly } from 'pg-dolly';

const schema = await readFile(
    new URL(import.meta.resolve('@leyman/demo-openapi-database/schema.sql')),
    'utf8'
);
const dolly = await PgDolly.connect();
const database = await (await dolly.template(schema)).clone();
```

## The schema

The Drizzle schema ([`src/schema.ts`](./src/schema.ts)) puts the defaults in the database, so every test database has them too. The id defaults to `uuidv7()`, which is ordered by time, so notes made in the same transaction still list in order, and the time defaults to `now()`. `uuidv7()` needs Postgres 18, which the devcontainer and CI run. Each note has an `owner` (the `sub` of the token that made it), and the index that `listNotes` reads starts with it, so it lists one owner's notes, newest first.

Migrations are plain SQL, generated and then reviewed. `drizzle-kit generate --name <name>` writes them to `migrations/`, and the `drizzle-kit-check` target fails CI if the schema has changes that no migration covers. `0002_add-note-owner` adds `owner` as `NOT NULL` with no default, which only works on an empty table. That's fine for a demo with no deployed data, but a table with rows would need the column added in steps (nullable, backfilled, then `NOT NULL`).

`idempotency_keys` is [idempotency-keys](../../../tools/idempotency-keys/ts)'s table, where the server keeps the `Idempotency-Key` of each `createNote` and the response it gave. `0003_add-idempotency-keys` is a custom migration (`drizzle-kit generate --custom`) that holds the library's `createTableSql()` as it is, and a test checks that the two are identical, so the table matches the [specification](../../../tools/idempotency-keys/SPEC.md#postgres) that other implementations share. The library queries it with its own SQL, so it isn't a Drizzle table. Drizzle's snapshots don't know about it, and `drizzle-kit generate` leaves it alone.

`schema.sql` is what the migrations build, kept up to date by the `schema-snapshot` target ([`pg-dolly-schema`](../../../apps/pg-dolly-schema) running `drizzle-kit migrate` on an empty database). It includes Drizzle's own `drizzle.__drizzle_migrations` table with its rows (`--data`), so every test database knows its migrations have run, and migrating one does nothing.

## Why a package of its own

`schema.sql` is generated against a real database, so the `schema-snapshot` target only reruns when something it reads changes (the migrations, `drizzle.config.js`, or the versions of `pg_dump` and the server). When it lived in the server package, it also reran on every handler edit. As a package of its own, the schema is an output the server consumes, like the spec's `openapi.json`.

## Testing

The tests check what the server relies on, against a clone of `schema.sql`. The database fills in the id and the time, ids made in one transaction are in order, the indexes are the ones the Drizzle schema declares, `idempotency_keys` is created exactly as idempotency-keys declares it, and migrating a clone does nothing.
