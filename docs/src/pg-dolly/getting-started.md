---
description: Install pg-dolly, point it at a Postgres server, and give each test a database cloned from your schema.
---

# Getting started

## Install

::: code-group

```sh [npm]
npm i --save-dev pg-dolly
```

```sh [pnpm]
pnpm add --save-dev pg-dolly
```

```sh [yarn]
yarn add --dev pg-dolly
```

:::

::: tip
pg-dolly is ESM only, for Node.js 24 or later. Its one dependency is [`pg`](https://www.npmjs.com/package/pg), for its own admin connection: tests connect with whatever client the project uses.
:::

## A server

pg-dolly needs a Postgres server, in `DATABASE_URL`, as a user that can create databases:

```sh
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
```

A local server, a devcontainer sidecar or a CI service all work. Without one, it fails rather than skipping the tests: leaving out integration tests should be a choice, not something that happens quietly.

Test databases don't need to survive a restart, so a server only for tests can run with `fsync=off`, `synchronous_commit=off` and `full_page_writes=off`, and its data on a `tmpfs`.

## A schema

The schema is SQL: ideally a dump of what your migrations build, committed as `schema.sql`. [pg-dolly-schema](/pg-dolly-schema/) keeps that file for any migration tool, and fails CI when it's stale. See [The schema](/pg-dolly/guides/schema) for other ways.

## Connect once, clone per test

Once per test run, connect and get the template. The first run builds it, and later runs (and other processes) reuse it until the SQL changes:

```ts
// @filename: node.d.ts
declare module 'node:fs/promises' {
    export function readFile(path: string, encoding: 'utf8'): Promise<string>;
}
// @filename: index.ts
// ---cut---
import { readFile } from 'node:fs/promises';
import { PgDolly } from 'pg-dolly';

const dolly = await PgDolly.connect();
const template = await dolly.template(await readFile('schema.sql', 'utf8'));
```

For each test, clone it, and connect to the clone's URL with any client:

```ts
import pg from 'pg';
import type { DollyTemplate } from 'pg-dolly';

declare const template: DollyTemplate;
// ---cut---
const database = await template.clone();

const client = new pg.Client({ connectionString: database.url });
await client.connect();
await client.query("INSERT INTO item (id, name) VALUES (1, 'dolly')");
await client.end();
```

When a test fails, keep its database. Its name is printed, so you can connect to it and look:

```ts
import type { DollyDatabase } from 'pg-dolly';

declare const database: DollyDatabase;
// ---cut---
database.keep();
```

At the end of the run, close. Every clone not kept is dropped:

```ts
import type { PgDolly } from 'pg-dolly';

declare const dolly: PgDolly;
// ---cut---
await dolly.close();
```

Close every connection to the clones first: dropping a database ends any left open.

## Next steps

- [Test runners](/pg-dolly/guides/test-runners): the same pattern in mocha-chain, Mocha and Vitest.
- [The schema](/pg-dolly/guides/schema): a dump of your migrations, and `dumpSchema`.
- [Deterministic tests](/pg-dolly/guides/deterministic-tests): writing tests that pass alone, in any order and in parallel.
- [How it works](/pg-dolly/guides/how-it-works): templates, markers, run locks and cleanup.
- [API reference](/pg-dolly/reference/api): every option, export and error.
