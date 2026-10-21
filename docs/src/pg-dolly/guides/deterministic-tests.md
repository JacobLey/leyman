---
description: Writing database tests that pass alone, in any order and in parallel, with a pg-dolly clone per test.
---

# Deterministic tests

Each test starts from the schema and nothing else, so it can be run alone, in any order, and in parallel. A few habits keep it that way:

- **Defaults live in the schema** (`DEFAULT now()`, `gen_random_uuid()`, sequences, constraints), so every clone has them. A default set by application code is one the tests have to remember to set.
- **Don't assert values the database makes up** (`now()`, generated ids) unless the test passes them in. Assert that an id is a UUID, or that a time is after the test started.
- **The server's configuration doesn't leak in.** Every database gets the same [`settings`](/pg-dolly/reference/api#options), including while the template is built: by default UTC, ISO dates, the `C` locale for money, numbers and times, and the `simple` text search configuration, rather than whatever `initdb` took from the machine. Set others, such as `search_path`, there too.
- **Data a test needs is inserted by the test**, or by a fixture builder next to it, after cloning, so what it starts from is visible where it matters. Only data nearly every test needs belongs in a [seed](/pg-dolly/guides/schema#data-every-test-needs).
- **Keep pools small** (a few connections): every test of every parallel run shares the server's `max_connections`.
- **Close connections before `close()`**. Dropping a database ends any connection left open, so a leak can't hang the run, but the client then sees an error.

## Debugging a failed test

Keep a failed test's database with `keep()`. Its name is printed, and it is left on the server for `retainMs` (a day by default):

```sh
psql "postgres://postgres:postgres@localhost:5432/pg_dolly_…"
```

A later run drops it once `retainMs` has passed. To clear everything sooner, drop the databases starting with the prefix, or reset a server used only for tests.
