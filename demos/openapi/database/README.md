# demo-openapi-database

The OpenAPI demo's Postgres schema: Drizzle tables, the migrations that build them, and schema.sql, what the migrations build, for tests to clone.

Part of the [OpenAPI demo](../README.md). A worked example, never published.

## Contents
- [What it exports](#what-it-exports)
- [The schema](#the-schema)
- [Why a package of its own](#why-a-package-of-its-own)
- [Testing](#testing)

## What it exports

| Export | What |
|---|---|
| `notes` | The Drizzle table, for queries |
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

- **The Drizzle schema** ([`src/schema.ts`](./src/schema.ts)) puts the defaults in the database: the id (`uuidv7()`, ordered by time, so notes made in the same transaction still list in order) and the time (`now()`), so every test database has them too. `uuidv7()` needs Postgres 18, which the devcontainer and CI run.
- **Migrations are SQL, generated and reviewed**: `drizzle-kit generate --name <name>` writes them to `migrations/`. The `drizzle-kit-check` target fails CI if the schema has changes no migration covers.
- **`schema.sql` is what the migrations build**, kept by the `schema-snapshot` target ([`pg-dolly-schema`](../../../apps/pg-dolly-schema) running `drizzle-kit migrate` on an empty database). It includes Drizzle's own `drizzle.__drizzle_migrations` table, rows and all (`--data`), so every test database knows its migrations ran, and migrating one does nothing.

## Why a package of its own

`schema.sql` is generated against a real database, so the `schema-snapshot` target only reruns when something it reads changes: the migrations, `drizzle.config.js`, and the versions of `pg_dump` and the server. In the server, it also ran for every handler edit. As a package, the schema is an output the server consumes, like the spec's `openapi.json`.

## Testing

Against a clone of `schema.sql`, the tests check what the server relies on: the database makes the id and the time, ids made in one transaction are in order, and migrating a clone does nothing.
