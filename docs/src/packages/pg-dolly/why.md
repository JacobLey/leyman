---
description: Why each test gets a Postgres database of its own, why templates and SQL, how runs share a server safely, and how pg-dolly compares.
---

# Why pg-dolly?

Integration tests against Postgres should be deterministic and repeatable. Each test should start from a state it sets up itself, rather than from whatever a developer's database happens to hold, what a previous run left behind, or a manual setup step. `pg-dolly` makes that the default by giving every test a database of its own, holding a copy of the schema and nothing else.

## Why a database per test

The usual shortcuts each give up something.

- Running each test in a transaction that's rolled back at the end is cheap, but nothing is ever committed, so a test can't check what happens on commit. `NOTIFY` is only sent on commit, a second connection doesn't see uncommitted data, and advisory locks and row locks can't be raced from two connections. Code that manages its own transactions also has to be changed to run inside the test's.
- With one shared database cleared between tests, the tests can't run in parallel. A test that forgets to clean up breaks the next one, and the order tests run in starts to matter.
- On a developer's own database, whether a test passes depends on months of local changes no one wrote down.

A database per test avoids all of these. The test uses Postgres the same way production does, and shares nothing with any other test.

## Why templates

Building the schema for every test (running every migration, or a long `schema.sql`) gets slow as the schema grows. Postgres can copy a whole database instead. `CREATE DATABASE clone TEMPLATE template` copies the template's data, and for a test schema (tables and functions, but few rows) that takes milliseconds, however long the schema took to build.

So `pg-dolly` builds the template once and clones it for each test. Templates are named by the hash of their SQL and kept between runs, so a run usually builds nothing at all. A template is only reused while it can't have changed, which takes a few precautions.

- It's built under a temporary name and renamed when done. A rename is atomic, so a template's real name only ever refers to a finished database, even if the run building it crashes.
- It's built under an advisory lock on its name, so two runs can't build the same template at once. The second waits, then finds it built.
- It's marked `ALLOW_CONNECTIONS false`, so nothing can connect to it and change it without first allowing connections again on purpose. A template that allows connections may have been changed, so `pg-dolly` drops it and builds it again rather than reusing it.

## Why the schema is SQL

An ORM's schema only knows what the ORM models. A trigger, a function or a view written by hand in a migration is invisible to it, so a test database built from the ORM's model is missing them. The schema `pg-dolly` takes is SQL instead, ideally a `pg_dump --schema-only` of what the migrations actually build, committed next to them (the `structure.sql` approach). Then a PR's diff shows the real schema change, triggers included.

This also keeps `pg-dolly` free of any ORM. Running migrations is the one ORM-specific step, and it belongs to the tool the project already has.

## Sharing a server safely

Tests usually run against the same server as a developer's own databases, and many runs share it at once (parallel processes, other packages' tests, other branches). `pg-dolly` is built to stay out of their way.

- It only drops databases it made. Every database `pg-dolly` creates gets its prefix and a marker (a JSON comment on the database, with the prefix and the run it belongs to), and it only drops databases that have both. A database that just happens to start with the prefix is left alone. The one exception is a database with no comment and a name only `pg-dolly` gives (`<prefix>_<run>_<n>`), which a run leaves if it crashed between creating and marking it. The name says which run it belongs to, so that run's lock shows whether it's gone.
- Runs can tell whether another run is still going. Each run's admin connection holds an advisory lock on its run id until it closes, and Postgres releases the lock when the connection ends, even after a crash. So a run that can take another run's lock knows that run is gone.
- Templates in use aren't dropped as unused. A run holds a shared lock on every template it uses, and dropping an unused template needs that lock exclusively.
- Clones are named by run, so parallel runs can't pick the same name.

## Cleaning up

- When a run ends, its clones are dropped all at once rather than after each test, because dropping a database forces a checkpoint, and doing that once per test adds up.
- A failed test's clone is kept to inspect, and its name printed. A later run drops it once `retainMs` has passed, rather than the very next run, so a run of another package's tests started right after doesn't drop it while someone is looking.
- What a crashed run left behind is dropped by the next run to connect, since the crashed run's lock is free. `DROP DATABASE … WITH (FORCE)` also ends connections the crashed process left open.
- Templates no run has used for `retainMs` are dropped, so changing the schema over and over doesn't fill the server with old templates.


## Non-goals

- It doesn't run migrations, since each ORM has its own way (Drizzle's `migrate`, Prisma's `migrate deploy`, Kysely's `Migrator`). `template('')` gives an empty database to run them in, and [pg-dolly-schema](/packages/pg-dolly-schema/) runs a project's own migrate command in one to keep its `schema.sql`.
- It doesn't provide the server. It takes `DATABASE_URL`, and fails without it, so integration tests are only left out when you choose which tests to run.
- It has no fixtures. Data only some tests need is inserted by those tests, after cloning, so it's visible next to the test that uses it. Data every test needs can be a seed, run into the template once, but only as SQL, because pg-dolly has to hash it to know when to build again.

## Compared to alternatives

- [pgtestdb](https://github.com/peterldowns/pgtestdb) (Go) is where the design comes from, with templates named by a hash of the schema, and a clone per test that's kept on failure. `pg-dolly` hashes the SQL itself rather than taking a migrator, and adds the markers and run locks so parallel runs, and runs that crashed, clean up safely.
- A transaction rolled back per test is the cheapest per test, and fine for code that never commits, listens or races connections. See [above](#why-a-database-per-test).
- [Testcontainers](https://testcontainers.com/) starts a container (often one per test file or suite). It provides the server, which `pg-dolly` leaves to the environment (a devcontainer sidecar, a CI service). The two can be combined, with a container as the server and `pg-dolly` for a database per test.
- [PGlite](https://pglite.dev/) runs Postgres in WebAssembly, in process, with nothing to install. A fresh instance per test is cheap, but it takes one connection at a time, so concurrent connections can't be tested, and it isn't the server production runs.
- Writing it by hand is common: migrate a template once, then `CREATE DATABASE … TEMPLATE` for each test. The pattern is short, and most of the work is in making it safe next to dev data, between parallel runs, and after crashes.
