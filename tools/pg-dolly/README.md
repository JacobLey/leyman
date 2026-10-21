<div style="text-align:center">

# pg-dolly
A fresh Postgres database for every test, cloned from a template built once from your schema's SQL.

[![npm package](https://badge.fury.io/js/pg-dolly.svg)](https://www.npmjs.com/package/pg-dolly)
[![License](https://img.shields.io/npm/l/pg-dolly.svg)](https://github.com/JacobLey/leyman/blob/main/tools/pg-dolly/LICENSE)

</div>

pg-dolly gives each test its own Postgres database. It builds a template from your schema once, and every test gets a copy of it (`CREATE DATABASE … TEMPLATE`), which takes a few milliseconds.

- Tests run against a real database of their own, so they can commit, `LISTEN`, take locks and open several connections. Rolling back a transaction after each test rules all of that out.
- The template is kept between runs, under a hash of the SQL, so it's only built again when the schema changes.
- It can share a server with your dev databases and with other test runs. It only ever drops databases it created, and parallel runs never see each other's.
- Bring your own migrations, client and test runner. It takes SQL, and gives back a connection URL.
- A failed test's database is kept so you can look at it. Everything else is dropped, including what a crashed run left behind.

Named after Dolly the sheep. The design follows Go's [pgtestdb](https://github.com/peterldowns/pgtestdb). For why each test gets a database, and how runs stay out of each other's way, see [WHY-PG-DOLLY.md](https://github.com/JacobLey/leyman/blob/main/tools/pg-dolly/WHY-PG-DOLLY.md). Guides for each test runner, and the full reference, are on the [docs site](https://jacobley.github.io/leyman/pg-dolly/).

## Contents
- [Install](#install)
- [Example](#example)
- [The schema](#the-schema)
- [In tests](#in-tests)
- [Data every test needs](#data-every-test-needs)
- [Speed](#speed)
- [How it works](#how-it-works)
- [API](#api)
  - [PgDolly.connect](#pgdollyconnectoptions)
  - [dolly.template](#dollytemplatesql-options)
  - [template.clone](#templateclone)
  - [dolly.close](#dollyclose)
  - [dumpSchema](#dumpschemaurl-options)
  - [Errors](#errors)
- [Compared to alternatives](#compared-to-alternatives)

## Install

```sh
npm i --save-dev pg-dolly
```

ESM only, for Node.js. Its one dependency is [`pg`](https://www.npmjs.com/package/pg), for its own admin connection. Tests connect with whatever client the project uses.

It needs a Postgres server in `DATABASE_URL` (e.g. `postgres://postgres:postgres@localhost:5432/postgres`), as a user that can create databases. Without one, it fails rather than skipping the tests.

## Example

```ts
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PgDolly } from 'pg-dolly';

// Once per test run
const dolly = await PgDolly.connect();
const template = await dolly.template(await readFile('schema.sql', 'utf8'));

// For each test
const database = await template.clone();
const client = new pg.Client({ connectionString: database.url });
await client.connect();
await client.query("INSERT INTO item (id, name) VALUES (1, 'dolly')");
await client.end();

// If the test failed, keep its database to look at
database.keep();

// At the end of the run: drops every clone not kept
await dolly.close();
```

## The schema

The template is built from plain SQL, usually a `schema.sql` committed next to your migrations, holding what they build:

```sql
CREATE TABLE public.item (
    id integer PRIMARY KEY,
    name text NOT NULL
);

CREATE FUNCTION public.announce_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('item_added', NEW.name);
    RETURN NEW;
END;
$$;

CREATE TRIGGER announce_item AFTER INSERT ON public.item
    FOR EACH ROW EXECUTE FUNCTION public.announce_item();
```

Because it's SQL, everything a migration can create (triggers, functions, views, extensions) is in every test database, not only what an ORM models.

Don't write it by hand. [`pg-dolly-schema`](https://www.npmjs.com/package/pg-dolly-schema) runs your migrate command (`drizzle-kit migrate`, `prisma migrate deploy`, ...) on an empty database and dumps the result to `schema.sql`, and in CI it fails when the file is out of date. The [OpenAPI demo's server](https://github.com/JacobLey/leyman/tree/main/demos/openapi/server) does this with Drizzle. To run migrations in each test instead, start from `template('')`, an empty database.

## In tests

pg-dolly doesn't depend on a test runner. Whatever you use, the pattern is the same:

- **Once per run:** `connect()` and `template()` before the tests, and `close()` after them.
- **For each test that needs a database:** `clone()` before it, and `keep()` after it if it failed.

With [mocha-chain](https://www.npmjs.com/package/mocha-chain), all of that lives in one helper file, and the clone reaches each test as a typed fixture.

`test/helpers/database.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { before } from 'mocha-chain';
import { PgDolly } from 'pg-dolly';

const schema = await readFile(new URL('../../schema.sql', import.meta.url), 'utf8');

// At the top level of a module, a hook applies to every test in the run: a root hook, run once per process
const withDolly = before(async () => {
    const dolly = await PgDolly.connect();
    return { dolly, template: await dolly.template(schema) };
});
withDolly.after(async ({ dolly }) => {
    await dolly.close();
});

/**
 * A database of its own for each test of the suite it's called in. A failed test's is kept.
 */
export const withDatabase = () => {
    const withClone = withDolly.beforeEach(async ({ template }) => ({ database: await template.clone() }));
    withClone.afterEach(function ({ database }) {
        if (this.currentTest?.state === 'failed') {
            database.keep();
        }
    });
    return withClone;
};
```

The per-test hooks are inside `withDatabase()` rather than at the top level, where they would be root hooks too, and would clone a database for every test in the run, whether it needs one or not.

`test/items.spec.ts`:

```ts
import { once } from 'node:events';
import { expect } from 'chai';
import { suite } from 'mocha-chain';
import pg from 'pg';
import { withDatabase } from './helpers/database.js';

suite('Items', () => {
    const withPool = withDatabase().beforeEach(({ database }) => ({
        // Keep pools small: every test shares the server's `max_connections`
        pool: new pg.Pool({ connectionString: database.url, max: 2 }),
    }));
    withPool.afterEach(async ({ pool }) => {
        await pool.end();
    });

    withPool.test('Adds an item', async ({ pool }) => {
        await pool.query("INSERT INTO item (id, name) VALUES (1, 'dolly')");

        const { rows } = await pool.query('SELECT name FROM item');
        expect(rows).to.deep.equal([{ name: 'dolly' }]);
    });

    withPool.test('Announces each item added', async ({ database, pool }) => {
        const listener = new pg.Client({ connectionString: database.url });
        await listener.connect();
        await listener.query('LISTEN item_added');
        const announced = once(listener, 'notification');

        await pool.query("INSERT INTO item (id, name) VALUES (1, 'dolly')");

        const [notification] = await announced;
        expect(notification.payload).to.equal('dolly');
        await listener.end();
    });
});
```

The second test only works because the insert commits: in a transaction rolled back after the test, the notification would never be sent.

The docs site shows the same with [Mocha and Vitest](https://jacobley.github.io/leyman/pg-dolly/guides/test-runners).

## Data every test needs

Data most tests need (reference rows, a default account) shouldn't go in `schema.sql`, which holds what the migrations build. Pass it as a seed instead. It runs once, after the schema, and every clone starts with it:

```ts
const template = await dolly.template(await readFile('schema.sql', 'utf8'), {
    seed: await readFile('test/seed.sql', 'utf8'),
});
```

The seed is part of the template's hash, like the schema, so changing it builds a new template. That's why it's SQL rather than a function: pg-dolly can't tell when a function's output would change.

Data only a few tests need is better inserted by those tests, after cloning, where it's visible next to what it's for.

## Speed

Measured on a laptop (Postgres 18.6 in Docker), for schemas where each table has a primary key, an index and a foreign key:

| Tables | Build the template (once) | Clone (per test) | Drop at `close()` (per test) |
|---|---|---|---|
| 10 | 20-45 ms | 7-14 ms | 2 ms |
| 100 | 70 ms | 13-24 ms | 2 ms |
| 500 | 300 ms | 50-60 ms | 3 ms |

Connecting to a clone and running a first query takes another 4 ms or so.

These are for a server with durability off (`fsync`, `synchronous_commit` and `full_page_writes`), which is how a test server should run. With Postgres's defaults, clones take about twice as long, and each drop waits for a checkpoint that writes the clone to disk: 0.2 s per test for 10 tables, and over a second for 500, all of it spent in `close()`. For a server only tests use:

```sh
docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:18 \
    -c fsync=off -c synchronous_commit=off -c full_page_writes=off
```

## How it works

- **Templates.** `template(sql)` hashes the SQL and looks for a template with that name. If there isn't one, it creates a database (from `template0`), runs the SQL in it, marks it as a template nothing can connect to (`IS_TEMPLATE true ALLOW_CONNECTIONS false`), then renames it to the real name. A rename is atomic, so a half-built template never has the real name. Runs building the same template wait for each other on an advisory lock. A template that allows connections again may have been changed, so it's dropped and built again.
- **Clones.** `clone()` is `CREATE DATABASE … TEMPLATE`, which copies the template's files rather than running the SQL again. A clone doesn't inherit database settings, so each gets `settings` again.
- **Markers.** Every database it creates has the prefix and a JSON comment marking it, with the run it belongs to. It only drops databases that have both, or no comment at all and a name only it gives (`<prefix>_<run>_<n>`), which a run that crashed before marking one leaves.
- **Runs.** Each `PgDolly` holds an advisory lock on its own run id until it closes. A run that can take another run's lock knows that run is gone, and drops what it left. Each run also holds a shared lock on the templates it uses, so no other run drops them as unused.
- **Cleanup.** `close()` drops the run's clones, except those kept. `connect()` drops the clones of runs that ended without closing, templates no run has used for `retainMs`, and kept clones that old.

## API

### `PgDolly.connect(options?)`

Connects to the server, and drops what earlier runs left behind (see [How it works](#how-it-works)).

**Returns** `Promise<PgDolly>`

**Throws** `PgDollyMissingUrlError` without `url` or `DATABASE_URL`, and `PgDollyPrefixError` for an invalid prefix.

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | `process.env.DATABASE_URL` | Server to connect to, as a `postgres://` URL. The URLs of clones differ from it only in the database name. |
| `prefix` | `string` | `'pg_dolly'` | Start of every database name it creates: 1-20 lowercase letters, digits and underscores, starting with a letter. |
| `settings` | `Record<string, string \| string[]>` | `defaultSettings` | Settings of every database, as `ALTER DATABASE … SET`. A list is a setting that takes several values (`search_path: ['app', 'public']`). Merged over the exported `defaultSettings`, which pin what `initdb` takes from the machine: `TimeZone: 'UTC'`, `DateStyle: 'ISO, MDY'`, `lc_monetary`, `lc_numeric` and `lc_time: 'C'`, and `default_text_search_config: 'pg_catalog.simple'`. Templates are built with them, and they are part of the template's hash. |
| `retainMs` | `number` | `86_400_000` (a day) | How long a template no run has used is kept, and a clone kept from a failed test. |

### `dolly.template(sql, options?)`

Gets the template for a schema, building it unless an earlier run already did. Calls with the same SQL share one template, and templates are built one at a time.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sql` | `string` | The schema, e.g. a committed `schema.sql`. An empty string gives an empty database, e.g. to run migrations in. |
| `options.seed` | `string` | SQL run after the schema, for data every test starts from. See [Data every test needs](#data-every-test-needs). |

**Returns** `Promise<DollyTemplate>`: `{ name, hash, clone }`, where `hash` is the hash of the SQL (schema and seed), and `name` is `<prefix>_t_<hash>`.

**Rejects** with the error from Postgres if the SQL fails. Nothing is left behind, and the next call tries again.

### `template.clone()`

Creates a fresh database from the template, for one test.

**Returns** `Promise<DollyDatabase>`:

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Database name, starting with the prefix. |
| `url` | `string` | Connection URL: the server's, with this database's name. |
| `keep()` | `() => void` | Keeps the database when `close()` drops the rest, and prints its name. A later run drops it once `retainMs` has passed. |

### `dolly.close()`

Drops this run's clones, except those kept, and closes the connection. Calling it again does nothing. After it, `template()` and `clone()` reject with `PgDollyClosedError`.

Close the tests' connections to their clones first: dropping a database ends any left open.

### `dumpSchema(url, options?)`

Dumps a database's schema with `pg_dump --schema-only`, normalized so the same schema always gives the same text: no version comments, and no `\restrict` lines (psql meta-commands with a random key, which no other client could run). Owners, privileges and tablespaces are left out, as they name one server's roles. The result can be passed to `template()` as is.

`options.data` lists tables to dump the rows of too, after the schema, as `INSERT`s (any client can run them, unlike `COPY`), with the sequences they own set to match. It's for a migration tool's own table (`drizzle.__drizzle_migrations`), so a database built from the dump knows its migrations ran.

Needs `pg_dump` on the `PATH`, at least the server's major version.

**Returns** `Promise<string>`

To keep a committed `schema.sql` up to date, and check it in CI, use [`pg-dolly-schema`](https://www.npmjs.com/package/pg-dolly-schema).

### Errors

Every error `pg-dolly` throws extends `PgDollyError`.

| Error | When |
|-------|------|
| `PgDollyMissingUrlError` | Neither `url` nor `DATABASE_URL` is set. |
| `PgDollyPrefixError` | The prefix can't start a database name. Has `prefix`. |
| `PgDollyClosedError` | Used after `close()`. |

## Compared to alternatives

| | pg-dolly | A transaction rolled back per test | One database, cleared between tests | Testcontainers | PGlite |
|---|---|---|---|---|---|
| Commits, `NOTIFY`, advisory locks, concurrent connections | ✅ | ❌ | ✅ | ✅ | Limited (one connection) |
| Tests in parallel | ✅ | ✅ | ❌ | ✅ | ✅ |
| Cost per test | A database copy | Cheapest | Truncating every table | A container, unless shared | An in-process database |
| The real Postgres server | ✅ | ✅ | ✅ | ✅ | Postgres in WebAssembly |
| Needs | A server | A server | A server | Docker | Nothing |

[pgtestdb](https://github.com/peterldowns/pgtestdb) does the same in Go. See [WHY-PG-DOLLY.md](https://github.com/JacobLey/leyman/blob/main/tools/pg-dolly/WHY-PG-DOLLY.md#compared-to-alternatives) for the full comparison.
