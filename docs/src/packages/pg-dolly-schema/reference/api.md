---
description: The pg-dolly-schema CLI and its options, snapshotSchema, and its errors.
---

# API and CLI

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
| `--data` | — | Table to keep the rows of too, e.g. the migration tool's own. Repeat for several. |
| `--prefix` | `pg_dolly` | Prefix of the databases created, as in [`PgDolly.connect()`](/packages/pg-dolly/reference/api#options). |

Every option can also be set as an environment variable: `PG_DOLLY_SCHEMA_` and the option in capitals (`PG_DOLLY_SCHEMA_MIGRATE`). The server is always `DATABASE_URL`.

## `snapshotSchema(options)`

What the CLI runs.

```ts
import { snapshotSchema } from 'pg-dolly-schema';

await snapshotSchema({ migrate: 'drizzle-kit migrate', cwd: 'packages/app', check: true });
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `migrate` | `string` | — | Shell command that migrates the database in `DATABASE_URL` from empty. |
| `file` | `string` | `'schema.sql'` | Where the schema is written, relative to `cwd`. |
| `cwd` | `string` | `process.cwd()` | Directory the command runs in, and `file` is relative to. |
| `check` | `boolean` | `true` in CI | Fail if the file isn't up to date, rather than writing it. |
| `url` | `string` | `process.env.DATABASE_URL` | Server to migrate a database on, as a `postgres://` URL. |
| `data` | `string[]` | `[]` | Tables to keep the rows of too, as `pg_dump --table` patterns, e.g. `drizzle.__drizzle_migrations`. |
| `prefix` | `string` | `'pg_dolly'` | Prefix of the databases created. |

**Returns** `Promise<void>`.

**Throws**

| Error | When |
|-------|------|
| `PgDollySchemaMigrateError` | The migrate command failed. Has `command`, `exitCode` (`null` if killed) and `database`, which is kept. |
| `PgDollySchemaEmptyError` | The migrate command succeeded but left the database empty. Has `command`. |
| From [populate-files](/packages/populate-files/) | With `check`, the file is not up to date. |
| From [pg-dolly](/packages/pg-dolly/reference/api#errors) | No `DATABASE_URL`, or an invalid prefix. |

`PgDollySchemaMigrateError` and `PgDollySchemaEmptyError` extend `PgDollySchemaError`.

```ts
import { PgDollySchemaMigrateError, snapshotSchema } from 'pg-dolly-schema';

try {
    await snapshotSchema({ migrate: 'drizzle-kit migrate' });
} catch (error) {
    if (error instanceof PgDollySchemaMigrateError) {
        console.error(`Migrations failed: inspect ${error.database}`);
    }
}
```

The `SnapshotSchemaOptions` type is exported too.
