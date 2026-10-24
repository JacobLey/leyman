---
description: Keep a schema.sql of what your Postgres migrations build - migrate an empty database, dump it, and fail CI when the committed file is stale.
---

# pg-dolly-schema

<ProjectHeader />

Keep a `schema.sql` of what your Postgres migrations build: migrate an empty database, dump it, and fail CI when the committed file is stale.

```sh
pg-dolly-schema --migrate 'drizzle-kit migrate'
```

This clones an empty database on the server, runs the migrate command with `DATABASE_URL` set to it, dumps its schema and writes it to `schema.sql`. In CI it fails instead if `schema.sql` would change.

**[Get started →](/packages/pg-dolly-schema/getting-started)**

## Features

- **The real schema, triggers included**: it's what Postgres says the migrations built (`pg_dump --schema-only`), not an ORM's model of it, so hand-written triggers, functions and views are all there.
- **Migrations are applied from empty on every run**: a migration that can't run cleanly fails, and a PR's diff of `schema.sql` shows the real schema change.
- **Any migration tool**: you give it the command (`drizzle-kit migrate`, `prisma migrate deploy`, a Kysely script). It runs it with `DATABASE_URL` set to a fresh, empty database, and fails if the command left it empty.
- **Stable text**: the same schema always dumps to the same file, with no versions or random keys in it, and the file is plain SQL that any client can run.
- **Ready for tests**: `schema.sql` is what [pg-dolly](/packages/pg-dolly/) builds each test's database from, and the dump is built as a template on the way, which proves it applies.

The `structure.sql` approach, for any stack. For why the schema is SQL, see [Why pg-dolly](/packages/pg-dolly/why#why-the-schema-is-sql). The [OpenAPI demo](/demos/openapi/) keeps its `schema.sql` this way, with Drizzle.

## Related

<ProjectRelated />
