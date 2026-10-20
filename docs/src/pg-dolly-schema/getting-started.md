---
description: Install pg-dolly-schema, give it your migrate command, and check schema.sql in CI, including as an Nx target.
---

# Getting started

## Install

::: code-group

```sh [npm]
npm i --save-dev pg-dolly-schema
```

```sh [pnpm]
pnpm add --save-dev pg-dolly-schema
```

```sh [yarn]
yarn add --dev pg-dolly-schema
```

:::

::: tip
pg-dolly-schema is ESM only, for Node.js 24 or later. It needs a Postgres server in `DATABASE_URL` (as a user that can create databases), and `pg_dump` on the `PATH`, at least the server's major version.
:::

## Write `schema.sql`

Run it with the command that migrates your database:

```sh
pg-dolly-schema --migrate 'drizzle-kit migrate'
```

1. It clones an empty database on the server, with [pg-dolly](/pg-dolly/).
2. It runs the migrate command in a shell, with `DATABASE_URL` set to that database.
3. It dumps the schema with [`dumpSchema`](/pg-dolly/guides/schema#dumpschema), and builds the dump as a template, which proves it applies.
4. It writes `schema.sql`.

The databases it made are dropped at the end, except the one a failed migrate command ran on, which is kept to inspect.

## Migrate commands

The command runs in a shell, in `--cwd`, with `DATABASE_URL` pointing at the empty database. It must migrate that database: a command that leaves it empty (for example because the tool reads another variable) fails, so it can't quietly migrate some other database.

| Tool | Command | Notes |
|------|---------|-------|
| Drizzle | `drizzle-kit migrate` | With `dbCredentials: { url: process.env.DATABASE_URL }` in `drizzle.config.ts`. Keep `drizzle-kit`'s own check (nothing left to `generate`) for what Drizzle models. |
| Prisma | `prisma migrate deploy` | With `url = env("DATABASE_URL")` in the datasource. |
| Kysely | `node migrate.ts` | A script that runs `Migrator.migrateToLatest()` on a `PostgresDialect` connected to `process.env.DATABASE_URL`. |
| Plain SQL files | `for f in migrations/*.sql; do psql -v ON_ERROR_STOP=1 -f "$f" "$DATABASE_URL" \|\| exit 1; done` | |

Every dump leaves out owners, privileges and tablespaces, which name one server's roles. Changing data in migrations works, but the snapshot only keeps the schema.

Migration tools often add a table of their own to record what ran (Drizzle's `drizzle.__drizzle_migrations`). It's in `schema.sql` too, which is accurate: every real database has it.

## Check it in CI

The file is checked, rather than written, when `CI` is set (or with `--check`), so CI fails when someone changed the migrations without regenerating `schema.sql`, or edited it by hand. Regenerate it locally by running the command again.

```sh
CI=1 pg-dolly-schema --migrate 'drizzle-kit migrate'
```

## As an Nx target

Set the command in `env`, not as an option. Nx passes options to the command in double quotes, where the shell expands `$DATABASE_URL` before the migrations see the database they should migrate:

```json
{
  "targets": {
    "schema-snapshot": {
      "executor": "nx:run-commands",
      "options": {
        "command": "pg-dolly-schema",
        "cwd": "{projectRoot}",
        "env": { "PG_DOLLY_SCHEMA_MIGRATE": "drizzle-kit migrate" }
      },
      "cache": true,
      "inputs": [
        "{projectRoot}/migrations/**/*",
        "{projectRoot}/schema.sql",
        { "runtime": "pg_dump --version" },
        { "env": "CI" }
      ],
      "outputs": ["{projectRoot}/schema.sql"]
    }
  }
}
```

With [nx-lifecycle](/nx-lifecycle/), bind it to a stage before the tests, so the tests always build from a current `schema.sql`.

## Next steps

- [API and CLI](/pg-dolly-schema/reference/api): every option and error.
- [pg-dolly](/pg-dolly/getting-started): a database per test, cloned from `schema.sql`.
