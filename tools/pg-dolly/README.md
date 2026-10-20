<div style="text-align:center">

# pg-dolly
A fresh Postgres database for every test, cloned from a template built once from your schema's SQL.

[![npm package](https://badge.fury.io/js/pg-dolly.svg)](https://www.npmjs.com/package/pg-dolly)
[![License](https://img.shields.io/npm/l/pg-dolly.svg)](https://github.com/JacobLey/leyman/blob/main/tools/pg-dolly/LICENSE)

</div>

- **A real database per test**: a test commits, `LISTEN`s, takes advisory locks and races two connections, which rolling back a transaction per test can't allow. Tests share nothing, so their order doesn't matter.
- **Fast, as the schema is built once**: each clone is a `CREATE DATABASE … TEMPLATE` copy of a template built from the SQL. The template is kept between runs, named by the hash of the SQL, so only a changed schema is built again.
- **The schema is SQL**: a dump of what your migrations build (`schema.sql`, kept by [`pg-dolly-schema`](https://www.npmjs.com/package/pg-dolly-schema)), so triggers, functions and hand-written views are in every test database. No ORM or test runner: bring your own migrations, client and runner (Mocha, mocha-chain and Vitest shown below).
- **Safe next to dev data, and in parallel**: it only ever drops databases it made, recognized by their prefix _and_ a marker. Parallel runs (other processes, other packages) share templates but never each other's clones.
- **Cleans up after itself, and after crashes**: clones are dropped when the run ends, except a failed test's, which is kept to inspect. What a crashed run left behind is dropped by the next one.

Named for Dolly the sheep: every test gets a clone. The design follows Go's [pgtestdb](https://github.com/peterldowns/pgtestdb).

For why each test gets a database of its own, and how runs stay safe from each other, see [WHY-PG-DOLLY.md](https://github.com/JacobLey/leyman/blob/main/tools/pg-dolly/WHY-PG-DOLLY.md).

## Contents
- [Install](#install)
- [Example](#example)
- [In tests](#in-tests)
  - [mocha-chain](#mocha-chain)
  - [Mocha](#mocha)
  - [Vitest](#vitest)
- [How it works](#how-it-works)
- [Writing deterministic tests](#writing-deterministic-tests)
- [API](#api)
  - [PgDolly.connect](#pgdollyconnectoptions)
  - [dolly.template](#dollytemplatesql)
  - [template.clone](#templateclone)
  - [dolly.close](#dollyclose)
  - [dumpSchema](#dumpschemaurl)
  - [Errors](#errors)
- [Compared to alternatives](#compared-to-alternatives)

## Install

```sh
npm i --save-dev pg-dolly
```

ESM only, for Node.js. Its one dependency is [`pg`](https://www.npmjs.com/package/pg), for its own admin connection. Tests connect with whatever client the project uses.

It needs a Postgres server to connect to, in `DATABASE_URL` (e.g. `postgres://postgres:postgres@localhost:5432/postgres`), as a user that can create databases. Without one, it fails rather than skipping the tests.

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

// A test failed: keep its database to look at
database.keep();

// At the end of the run: drops every clone not kept
await dolly.close();
```

## In tests

`pg-dolly` works with any test runner. The pattern is the same in each:

- **Once per run** (a root hook, or once per file): `connect()` and `template()`, and `close()` at the end. Calls in other processes or files reuse the template, so only the first builds it.
- **For each test that needs one:** `clone()` before it, and `keep()` after it if it failed.

### mocha-chain

With [mocha-chain](https://www.npmjs.com/package/mocha-chain), the clone is a typed fixture.

```ts
// test/helpers/database.ts
import { readFile } from 'node:fs/promises';
import { before } from 'mocha-chain';
import { PgDolly } from 'pg-dolly';

const schema = await readFile(new URL('../../schema.sql', import.meta.url), 'utf8');

// At the top level of a module, a hook applies to every test: a root hook, run once per process
const withDolly = before(async () => {
    const dolly = await PgDolly.connect();
    return { dolly, template: await dolly.template(schema) };
});
withDolly.after(async ({ dolly }) => {
    await dolly.close();
});

/**
 * Called inside a suite, so only its tests get a database each.
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

```ts
// test/integration/items.spec.ts
import { expect } from 'chai';
import { suite } from 'mocha-chain';
import { withDatabase } from '../helpers/database.js';

suite('Items', () => {
    const withStore = withDatabase().beforeEach(({ database }) => ({
        // A small pool: every test shares the server's `max_connections`
        store: new ItemStore({ connectionString: database.url, max: 2 }),
    }));
    withStore.afterEach(async ({ store }) => {
        await store.close();
    });

    withStore.test('Adds an item', async ({ store }) => {
        await store.add({ id: 1, name: 'dolly' });
        expect(await store.get(1)).to.include({ name: 'dolly' });
    });
});
```

Only `before` and `after` belong at the top level of the helper. A `beforeEach` there would also be a root hook, cloning a database for every test, whether it needs one or not.

### Mocha

```ts
import { readFile } from 'node:fs/promises';
import { type DollyDatabase, type DollyTemplate, PgDolly } from 'pg-dolly';

let dolly: PgDolly;
let template: DollyTemplate;

// At the top level of a spec file (or in a root hook plugin), so it runs once for every file
before(async () => {
    dolly = await PgDolly.connect();
    template = await dolly.template(await readFile('schema.sql', 'utf8'));
});
after(async () => {
    await dolly.close();
});

describe('Items', () => {
    let database: DollyDatabase;
    beforeEach(async () => {
        database = await template.clone();
    });
    afterEach(function () {
        if (this.currentTest?.state === 'failed') {
            database.keep();
        }
    });

    it('Adds an item', async () => {
        // Connect to `database.url`
    });
});
```

### Vitest

Vitest runs each file in its own worker, so `beforeAll` at the top of a file (or in a `setupFiles` file) connects once per file. Every file after the first reuses the template.

```ts
import { readFile } from 'node:fs/promises';
import { type DollyDatabase, type DollyTemplate, PgDolly } from 'pg-dolly';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';

let dolly: PgDolly;
let template: DollyTemplate;

beforeAll(async () => {
    dolly = await PgDolly.connect();
    template = await dolly.template(await readFile('schema.sql', 'utf8'));
});
afterAll(async () => {
    await dolly.close();
});

describe('Items', () => {
    let database: DollyDatabase;
    beforeEach(async ({ onTestFailed }) => {
        database = await template.clone();
        onTestFailed(() => {
            database.keep();
        });
    });

    test('Adds an item', async () => {
        // Connect to `database.url`
    });
});
```

## How it works

- **Templates.** `template(sql)` hashes the SQL and looks for a template with that name. If none exists, it creates a database (from `template0`), runs the SQL in it, marks it as a template that nothing can connect to (`IS_TEMPLATE true ALLOW_CONNECTIONS false`), then renames it to the real name. A rename is atomic, so a half-built template never has the real name.
  - Runs building the same template wait for each other on an advisory lock, then find it built.
  - A template that allows connections may have been changed since it was built, so it is dropped and built again.
- **Clones.** `clone()` is `CREATE DATABASE … TEMPLATE`, which copies the template's data rather than running the SQL again, so its cost depends on the size of the template rather than on what it took to build it.
- **Markers.** Every database it creates has the prefix and a JSON comment marking it, with the run it belongs to. It only drops databases that have both.
- **Runs.** Each `PgDolly` holds an advisory lock on its own run id until it closes. Another run that can take that lock knows the run is gone, and drops what it left behind. Each run also holds a shared lock on every template it uses, so no other run drops it as unused in the meantime.
- **Cleanup.** `close()` drops this run's clones, except those kept. `connect()` drops the clones of runs that ended without closing, and templates no run has used for `retainMs`, and clones kept that long. Each drop is `DROP DATABASE … WITH (FORCE)`, which also ends connections a test left open.

## Writing deterministic tests

Each test starts from the schema and nothing else, so it can be run alone, in any order, and in parallel.

- **Defaults live in the schema** (`DEFAULT now()`, sequences, constraints), so every clone has them.
- **Don't assert values the database makes up** (`now()`, generated ids) unless the test passes them in.
- **The clone's `TimeZone` is UTC** (see [`timeZone`](#options)): a clone doesn't inherit the template's `ALTER DATABASE` settings, and a test shouldn't depend on the server's.
- **Data a test needs is inserted by the test**, or by a fixture builder next to it, after cloning.
- **Keep pools small** (a few connections): every test of every parallel run shares the server's `max_connections`.

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
| `timeZone` | `string` | `'UTC'` | `TimeZone` setting of every clone. |
| `retainMs` | `number` | `86_400_000` (a day) | How long a template no run has used is kept, and a clone kept from a failed test. |

### `dolly.template(sql)`

Gets the template for a schema, building it unless an earlier run already did. Calls with the same SQL share one template, and templates are built one at a time.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sql` | `string` | The schema, e.g. a committed `schema.sql`. An empty string gives an empty database, e.g. to run migrations from. |

**Returns** `Promise<DollyTemplate>`: `{ name, hash, clone }`, where `hash` is the hash of the SQL and `name` is `<prefix>_t_<hash>`.

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

Close every connection to the clones first: dropping a database ends any left open.

### `dumpSchema(url)`

Dumps a database's schema with `pg_dump --schema-only`, normalized so the same schema always gives the same text: no version comments, and no `\restrict` lines (psql meta-commands with a random key, which no other client could run). Owners, privileges and tablespaces are left out, as they name one server's roles. The result can be passed to `template()` as is.

Needs `pg_dump` on the `PATH`, at least the server's major version.

**Returns** `Promise<string>`

To keep a committed `schema.sql` of what a project's migrations build, and check it in CI, use [`pg-dolly-schema`](https://www.npmjs.com/package/pg-dolly-schema).

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
