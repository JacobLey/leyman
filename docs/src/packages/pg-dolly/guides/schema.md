---
description: Where pg-dolly's schema SQL comes from - a committed dump of what your migrations build, dumpSchema, or migrations run per test run.
---

# The schema

`template(sql)` takes the schema as SQL. pg-dolly hashes it, and builds a template for each hash it hasn't seen. Where the SQL comes from is up to the project.

## A dump of what the migrations build

The best source is a `pg_dump --schema-only` of a database the project's migrations built, committed next to them as `schema.sql` (the `structure.sql` approach):

- **Everything is in it**: triggers, functions and views written by hand in a migration, which an ORM's model of the schema doesn't know about.
- **A PR's diff shows the real schema change**, not only the migration that makes it.
- **The test run builds nothing new** unless the schema changed, since the template is named by the hash of the file.

[pg-dolly-schema](/packages/pg-dolly-schema/) keeps that file: it migrates an empty database with your migrate command, dumps it, and writes `schema.sql`, or fails CI when it's stale.

```sh
pg-dolly-schema --migrate 'drizzle-kit migrate'
```

The [OpenAPI demo](/demos/openapi/) does this with Drizzle.

## Data every test needs

Data most tests need (reference rows, a default account) doesn't belong in `schema.sql`, which holds what the migrations build. Pass it as a seed: SQL run once, after the schema, into the template, so every clone starts with it.

```ts
// @filename: node.d.ts
declare module 'node:fs/promises' {
    export function readFile(path: string, encoding: 'utf8'): Promise<string>;
}
// @filename: index.ts
import type { PgDolly } from 'pg-dolly';

declare const dolly: PgDolly;
// ---cut---
import { readFile } from 'node:fs/promises';

const template = await dolly.template(await readFile('schema.sql', 'utf8'), {
    seed: await readFile('test/seed.sql', 'utf8'),
});
```

The seed is part of the template's hash, like the schema, so changing it builds a new template, and the same schema with and without a seed are two templates. It's SQL rather than a function because pg-dolly has to tell when it changed: a function's output can change without its code changing.

## `dumpSchema`

To dump a database's schema yourself, use `dumpSchema(url)`. It runs `pg_dump --schema-only`, normalized so the same schema always gives the same text:

- **No version comments** (`Dumped from database version …`), so upgrading `pg_dump` doesn't change the file.
- **No `\restrict` lines.** Recent versions of `pg_dump` write these psql meta-commands with a random key into every plain dump, so no two dumps would match, and no client but psql could run it.
- **No owners, privileges or tablespaces**, as they name one server's roles.

```ts
import { dumpSchema, type PgDolly } from 'pg-dolly';

declare const dolly: PgDolly;
// ---cut---
const sql = await dumpSchema('postgres://postgres:postgres@localhost:5432/app');
const template = await dolly.template(sql);
```

The result can be passed to `template()` as it is. `dumpSchema` needs `pg_dump` on the `PATH`, at least the server's major version.

## Migrations, every run

A project without a dump can build the template from migrations instead: `template('')` is an empty database. Clone it once, run the migrations on the clone, then dump that:

```ts
import type { DollyTemplate } from 'pg-dolly';

declare const empty: DollyTemplate;
declare const migrate: (url: string) => Promise<void>;
// ---cut---
import { dumpSchema } from 'pg-dolly';

const database = await empty.clone();
await migrate(database.url);
const sql = await dumpSchema(database.url);
```

This runs every migration on every run, which a committed `schema.sql` avoids, and leaves no file showing what changed. It's what pg-dolly-schema does, once, ahead of time.
