<div style="text-align:center">

# pg-dolly-schema
Keep a schema.sql of what your Postgres migrations build: migrate an empty database, dump it, and fail CI when the committed file is stale.

[![npm package](https://badge.fury.io/js/pg-dolly-schema.svg)](https://www.npmjs.com/package/pg-dolly-schema)
[![License](https://img.shields.io/npm/l/pg-dolly-schema.svg)](https://github.com/JacobLey/leyman/blob/main/apps/pg-dolly-schema/LICENSE)

</div>

- **The real schema, triggers included**: it's what Postgres says the migrations built (`pg_dump --schema-only`), not an ORM's model of it, so hand-written triggers, functions and views are all there.
- **Migrations are applied from empty on every run**: a migration that can't run cleanly fails, and a PR's diff of `schema.sql` shows the real schema change.
- **Any migration tool**: you give it the command (`drizzle-kit migrate`, `prisma migrate deploy`, a Kysely script); it runs it with `DATABASE_URL` set to a fresh, empty database.
- **Stable text**: the same schema always dumps to the same file, with no versions or random keys in it, and the file is plain SQL that any client can run.
- **Ready for tests**: `schema.sql` is what [`pg-dolly`](https://www.npmjs.com/package/pg-dolly) builds each test's database from, and the dump is built as a template on the way, which proves it applies.

The `structure.sql` approach, for any stack. For why the schema is SQL, see [pg-dolly's WHY-PG-DOLLY.md](https://github.com/JacobLey/leyman/blob/main/tools/pg-dolly/WHY-PG-DOLLY.md#why-the-schema-is-sql).

Guides and the full reference are on the [docs site](https://jacobley.github.io/leyman/packages/pg-dolly-schema/).

## Contents
- [Install](#install)
- [Example](#example)
- [Migrate commands](#migrate-commands)
- [In CI](#in-ci)
- [CLI](#cli)
- [API](#api)

## Install

```sh
npm i --save-dev pg-dolly-schema
```

ESM only, for Node.js. Needs a Postgres server in `DATABASE_URL` (as a user that can create databases), and `pg_dump` on the `PATH`, at least the server's major version.

## Example

```sh
pg-dolly-schema --migrate 'drizzle-kit migrate'
```

This clones an empty database on the server, runs the migrate command with `DATABASE_URL` set to it, dumps its schema and writes it to `schema.sql`. In CI (or with `--check`) it fails instead if `schema.sql` would change. The databases it made are dropped at the end, except the one a failed migrate command ran on, which is kept to inspect.

## Migrate commands

The command runs in a shell, in `--cwd`, with `DATABASE_URL` pointing at the empty database. It must migrate that database: a command that leaves it empty (for example because the tool reads another variable) fails, so it can't quietly migrate some other database.

| Tool | Command | Notes |
|------|---------|-------|
| Drizzle | `drizzle-kit migrate` | With `dbCredentials: { url: process.env.DATABASE_URL }` in `drizzle.config.ts`. Keep `drizzle-kit`'s own check (nothing left to `generate`) for what Drizzle models. |
| Prisma | `prisma migrate deploy` | With `url = env("DATABASE_URL")` in the datasource. |
| Kysely | `node migrate.ts` | A script that runs `Migrator.migrateToLatest()` on a `PostgresDialect` connected to `process.env.DATABASE_URL`. |
| Plain SQL files | `for f in migrations/*.sql; do psql -v ON_ERROR_STOP=1 -f "$f" "$DATABASE_URL" \|\| exit 1; done` | |

Every dump leaves out owners, privileges and tablespaces, which name one server's roles. Changing data in migrations works, but the snapshot only keeps the schema, and the rows of the `--data` tables.

Migration tools add a table of their own to record what ran (Drizzle's `drizzle.__drizzle_migrations`, Prisma's `_prisma_migrations`). A schema-only dump keeps that table but not its rows, so a database built from `schema.sql` looks like nothing was migrated, and migrating it (say, an app that migrates on startup, in a test) would run every migration again. `--data` keeps a table's rows too:

```sh
pg-dolly-schema --migrate 'drizzle-kit migrate' --data drizzle.__drizzle_migrations
```

Migrating a database built from that file then does nothing. The rows come from the migration files, so the file only changes when a migration does.

## In CI

The file is checked, rather than written, when `CI` is set (or with `--check`), so CI fails when someone changed the migrations without regenerating `schema.sql`, or edited it by hand. Regenerate it locally by running the command again.

As an Nx target, set the command in `env`, not as an option: Nx passes options to the command in double quotes, where the shell expands `$DATABASE_URL` before the migrations see the database they should migrate.

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
        { "runtime": "psql \"$DATABASE_URL\" -XtAc 'SHOW server_version'" },
        { "env": "CI" }
      ],
      "outputs": ["{projectRoot}/schema.sql"]
    }
  }
}
```

`schema.sql` depends on the versions of both `pg_dump` and the server (`pg_dump` writes for its own version, and dumps what the server reports), so both are inputs. A different version on another machine then shows up as a stale snapshot, rather than hiding behind the cache.

## CLI

```sh
pg-dolly-schema --migrate <command> [--file schema.sql] [--cwd .] [--check] [--data <table>...] [--prefix pg_dolly]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--migrate` | `PG_DOLLY_SCHEMA_MIGRATE` | Required. Shell command that migrates the database in `DATABASE_URL` from empty. |
| `--file` | `schema.sql` | File to write the schema to, relative to `--cwd`. |
| `--cwd` | `.` | Directory the command runs in, and `--file` is relative to. |
| `--check`, `--ci` | `true` in CI | Fail if the file is not up to date, rather than writing it. `--no-check` writes even in CI. |
| `--data` | — | Table to keep the rows of too, e.g. the migration tool's own. Repeat for several. See [Migrate commands](#migrate-commands). |
| `--prefix` | `pg_dolly` | Prefix of the databases created, as in [`PgDolly.connect()`](https://www.npmjs.com/package/pg-dolly#options). |

Every option can also be set as an environment variable: `PG_DOLLY_SCHEMA_` and the option in capitals (`PG_DOLLY_SCHEMA_MIGRATE`). The server is always `DATABASE_URL`: the CLI has no `--url`.

## API

### `snapshotSchema(options)`

What the CLI runs. Options as above: `migrate` (required), `file`, `cwd`, `check`, `data`, `prefix`, and `url` (default `process.env.DATABASE_URL`).

**Returns** `Promise<void>`

**Rejects**

| Error | When |
|-------|------|
| `PgDollySchemaMigrateError` | The migrate command failed. Has `command`, `exitCode` (`null` if killed) and `database`, which is kept. |
| `PgDollySchemaEmptyError` | The migrate command succeeded but left the database empty. Has `command`. |
| From [`populate-files`](https://www.npmjs.com/package/populate-files) | With `check`, the file is not up to date. |
| From [`pg-dolly`](https://www.npmjs.com/package/pg-dolly#errors) | `PgDollyMissingUrlError` without `url` or `DATABASE_URL`, `PgDollyPrefixError` for an invalid prefix. |
| An `Error` | `pg_dump` failed (e.g. a `--data` table that doesn't exist, or `pg_dump` is not on the `PATH`). |

`PgDollySchemaMigrateError` and `PgDollySchemaEmptyError` extend `PgDollySchemaError`. The `SnapshotSchemaOptions` type is exported too.

To dump a database's schema yourself, use [`dumpSchema()`](https://www.npmjs.com/package/pg-dolly#dumpschemaurl-options) from `pg-dolly`.
