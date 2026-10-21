---
description: PgDolly.connect and its options, template, clone, keep, close, dumpSchema, and pg-dolly's errors.
---

# API

## `PgDolly.connect(options?)`

Connects to the server, and drops what earlier runs left behind (see [Cleanup](/pg-dolly/guides/how-it-works#cleanup)).

```ts
import { PgDolly } from 'pg-dolly';

const dolly = await PgDolly.connect({ prefix: 'app_test', retainMs: 60 * 60_000 });
```

**Returns** `Promise<PgDolly>`.

**Throws** [`PgDollyMissingUrlError`](#errors) without `url` or `DATABASE_URL`, and [`PgDollyPrefixError`](#errors) for an invalid prefix.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | `process.env.DATABASE_URL` | Server to connect to, as a `postgres://` URL, as a user that can create databases. The URLs of clones differ from it only in the database name. |
| `prefix` | `string` | `'pg_dolly'` | Start of every database name it creates: 1-20 lowercase letters, digits and underscores, starting with a letter. |
| `timeZone` | `string` | `'UTC'` | `TimeZone` setting of every clone. |
| `retainMs` | `number` | `86_400_000` (a day) | How long a template no run has used is kept, and a clone kept from a failed test. |

## `dolly.template(sql, options?)`

Gets the template for a schema, building it unless an earlier run already did. Calls with the same SQL share one template, and templates are built one at a time.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sql` | `string` | The schema, e.g. a committed `schema.sql`. An empty string gives an empty database, e.g. to run migrations in. |
| `options.seed` | `string` | SQL run after the schema, for data every test starts from. Part of the hash. See [Data every test needs](/pg-dolly/guides/schema#data-every-test-needs). |

**Returns** `Promise<DollyTemplate>`:

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | `<prefix>_t_<hash>`. |
| `hash` | `string` | Hash of the SQL: the schema, and the seed if any. |
| `clone()` | `() => Promise<DollyDatabase>` | See [below](#template-clone). |

**Rejects** with the error from Postgres if the SQL fails. Nothing is left behind, and the next call tries again. After `close()`, with [`PgDollyClosedError`](#errors).

## `template.clone()`

Creates a fresh database from the template, for one test.

**Returns** `Promise<DollyDatabase>`:

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Database name, starting with the prefix. |
| `url` | `string` | Connection URL: the server's, with this database's name. |
| `keep()` | `() => void` | Keeps the database when `close()` drops the rest, and prints its name. A later run drops it once `retainMs` has passed. |

**Rejects** after `close()`, with [`PgDollyClosedError`](#errors).

## `dolly.close()`

Drops this run's clones, except those kept, and closes the connection. Calling it again does nothing.

Close every connection to the clones first: dropping a database ends any left open.

**Returns** `Promise<void>`.

## `dumpSchema(url)`

Dumps a database's schema with `pg_dump --schema-only`, normalized so the same schema always gives the same text: no version comments, no `\restrict` lines, and no owners, privileges or tablespaces. See [`dumpSchema`](/pg-dolly/guides/schema#dumpschema).

Needs `pg_dump` on the `PATH`, at least the server's major version.

**Returns** `Promise<string>`, which can be passed to `template()` as it is.

**Rejects** if `pg_dump` fails.

## Errors

Every error pg-dolly throws extends `PgDollyError`.

| Error | When |
|-------|------|
| `PgDollyMissingUrlError` | Neither `url` nor `DATABASE_URL` is set. |
| `PgDollyPrefixError` | The prefix can't start a database name. Has `prefix`. |
| `PgDollyClosedError` | Used after `close()`. |

```ts
import { PgDolly, PgDollyPrefixError } from 'pg-dolly';

try {
    await PgDolly.connect({ prefix: 'Not-Valid' });
} catch (error) {
    if (error instanceof PgDollyPrefixError) {
        error.prefix;
        //    ^?
    }
}
```

## Types

`PgDollyOptions`, `DollyTemplate` and `DollyDatabase` are exported as types.
