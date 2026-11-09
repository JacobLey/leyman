---
description: Keep a schema.sql of what your Postgres migrations build, for any migration tool, and fail CI when the committed file is stale.
---

# pg-dolly-schema

<ProjectHeader />

Keep a `schema.sql` of what your Postgres migrations build, for any migration tool, and fail CI when the committed file is stale.

```sh
pg-dolly-schema --migrate 'drizzle-kit migrate'
```

This clones an empty database on the server, runs the migrate command with `DATABASE_URL` set to it, dumps its schema and writes it to `schema.sql`. In CI it fails instead if `schema.sql` would change.

**[Get started →](/packages/pg-dolly-schema/getting-started)**

## Features

- The file is what Postgres says the migrations built (`pg_dump --schema-only`), rather than an ORM's model of the schema, so triggers, functions and views written by hand are in it too.
- Every run applies the migrations from empty, so a migration that can't run cleanly fails, and a PR's diff of `schema.sql` shows the real schema change.
- It works with any migration tool. You give it the command (`drizzle-kit migrate`, `prisma migrate deploy`, a Kysely script), and it runs it with `DATABASE_URL` set to a fresh, empty database, failing if the command left it empty.
- The same schema always dumps to the same text, with no versions or random keys in it, and the file is plain SQL that any client can run.
- [pg-dolly](/packages/pg-dolly/) builds each test's database from `schema.sql`, and the dump is built as a pg-dolly template along the way, which proves it applies.

It's the `structure.sql` approach, for any stack. For why the schema is SQL, see [Why pg-dolly](/packages/pg-dolly/why#why-the-schema-is-sql). The [OpenAPI demo](/demos/openapi/) keeps its `schema.sql` this way, with Drizzle.

## Related

<ProjectRelated />
