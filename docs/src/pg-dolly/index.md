---
description: A fresh Postgres database for every test, cloned from a template built once from your schema's SQL, safe next to dev data and across parallel runs.
---

# pg-dolly

A fresh Postgres database for every test, cloned from a template built once from your schema's SQL.

```ts
// @filename: node.d.ts
// Docs are type-checked without Node.js types
declare module 'node:fs/promises' {
    export function readFile(path: string, encoding: 'utf8'): Promise<string>;
}
// @filename: index.ts
// ---cut---
import { readFile } from 'node:fs/promises';
import { PgDolly } from 'pg-dolly';

// Once per test run
const dolly = await PgDolly.connect();
const template = await dolly.template(await readFile('schema.sql', 'utf8'));

// For each test
const database = await template.clone();
database.url;
//       ^?

// A test failed: keep its database to look at
database.keep();

// At the end of the run: drops every clone not kept
await dolly.close();
```

**[Get started →](/pg-dolly/getting-started)**

## Features

- **A real database per test**: a test commits, `LISTEN`s, takes advisory locks and races two connections, which rolling back a transaction per test can't allow. Tests share nothing, so their order doesn't matter.
- **Fast, as the schema is built once**: each clone is a `CREATE DATABASE … TEMPLATE` copy of a template built from the SQL. The template is kept between runs, named by the hash of the SQL, so only a changed schema is built again.
- **The schema is SQL**: a dump of what your migrations build (`schema.sql`, kept by [pg-dolly-schema](/pg-dolly-schema/)), so triggers, functions and hand-written views are in every test database. No ORM or test runner: bring your own migrations, client and runner. See [Test runners](/pg-dolly/guides/test-runners).
- **Safe next to dev data, and in parallel**: it only ever drops databases it made, recognized by their prefix _and_ a marker. Parallel runs (other processes, other packages) share templates but never each other's clones. See [How it works](/pg-dolly/guides/how-it-works).
- **Cleans up after itself, and after crashes**: clones are dropped when the run ends, except a failed test's, which is kept to inspect. What a crashed run left behind is dropped by the next one.

Named for Dolly the sheep: every test gets a clone. The design follows Go's [pgtestdb](https://github.com/peterldowns/pgtestdb). The [OpenAPI demo](/demos/openapi) uses it for every test of its server.

## Compared to

| | pg-dolly | A transaction rolled back per test | One database, cleared between tests | Testcontainers | PGlite |
|---|---|---|---|---|---|
| Commits, `NOTIFY`, advisory locks, concurrent connections | ✅ | ❌ | ✅ | ✅ | Limited (one connection) |
| Tests in parallel | ✅ | ✅ | ❌ | ✅ | ✅ |
| Cost per test | A database copy | Cheapest | Truncating every table | A container, unless shared | An in-process database |
| The real Postgres server | ✅ | ✅ | ✅ | ✅ | Postgres in WebAssembly |
| Needs | A server | A server | A server | Docker | Nothing |

See [Why pg-dolly](/pg-dolly/why) for the full comparison.
