---
description: A fresh Postgres database for every test, cloned from a template built once from your schema's SQL, safe next to dev data and across parallel runs.
---

# pg-dolly

<ProjectHeader />

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

**[Get started →](/packages/pg-dolly/getting-started)**

## Features

pg-dolly gives each test its own Postgres database, copied from a template it builds once from your schema (`CREATE DATABASE … TEMPLATE`). A copy takes a few milliseconds.

- Each test has a real database to itself, so it can commit, `LISTEN`, take locks and open several connections, none of which work inside a transaction that's rolled back after the test.
- Templates are kept between runs under a hash of the SQL, and only built again when the schema changes. See [Speed](/packages/pg-dolly/guides/how-it-works#speed).
- Dev databases and other test runs can use the same server, because pg-dolly only drops databases it created, and gives each run its own. See [How it works](/packages/pg-dolly/guides/how-it-works).
- It works with any migration tool, client and [test runner](/packages/pg-dolly/guides/test-runners), since it takes SQL ([`schema.sql`](/packages/pg-dolly/guides/schema), kept by [pg-dolly-schema](/packages/pg-dolly-schema/)) and gives back a connection URL.
- When a test fails, its database is kept so you can look at it. The rest are dropped, along with anything a crashed run left behind.

Named after Dolly the sheep. The design follows Go's [pgtestdb](https://github.com/peterldowns/pgtestdb). The [OpenAPI demo](/demos/openapi/) uses it for every test of its server.

## Compared to

|                                                           | pg-dolly        | A transaction rolled back per test | One database, cleared between tests | Testcontainers             | PGlite                   |
| --------------------------------------------------------- | --------------- | ---------------------------------- | ----------------------------------- | -------------------------- | ------------------------ |
| Commits, `NOTIFY`, advisory locks, concurrent connections | ✅              | ❌                                 | ✅                                  | ✅                         | Limited (one connection) |
| Tests in parallel                                         | ✅              | ✅                                 | ❌                                  | ✅                         | ✅                       |
| Cost per test                                             | A database copy | Cheapest                           | Truncating every table              | A container, unless shared | An in-process database   |
| The real Postgres server                                  | ✅              | ✅                                 | ✅                                  | ✅                         | Postgres in WebAssembly  |
| Needs                                                     | A server        | A server                           | A server                            | Docker                     | Nothing                  |

See [Why pg-dolly](/packages/pg-dolly/why) for the full comparison.

## Related

<ProjectRelated />
