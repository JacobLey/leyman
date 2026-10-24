---
description: Why each test gets a Postgres database of its own, why templates and SQL, how runs share a server safely, and how pg-dolly compares.
---

# Why pg-dolly?

Integration tests against Postgres have to be **deterministic and repeatable**: each test starts from a state it sets up itself, never from whatever a developer's database happens to hold, what a previous run left behind, or a manual setup step. `pg-dolly` makes that the default: every test gets a database of its own, a copy of the schema and nothing else.

## Why a database per test

The usual shortcuts each give up something:

- **A transaction per test, rolled back at the end.** Cheap, but nothing is ever committed, so a test can't check what happens on commit: `NOTIFY` is only sent then, a second connection never sees the data, advisory locks and row locks can't be raced from two connections, and code that manages its own transactions has to be changed to run inside the test's.
- **One shared database, cleared between tests.** Tests can't run in parallel, a test that forgets to clean up breaks the next one, and the order tests run in starts to matter.
- **A developer's own database.** Whether a test passes depends on months of local changes no one wrote down.

A database per test has none of these problems: the test uses Postgres exactly as production does, and shares nothing with any other test.

## Why templates

Building the schema for every test (running every migration, or a long `schema.sql`) gets slow as the schema grows. Postgres can copy a whole database instead: `CREATE DATABASE clone TEMPLATE template` copies the template's data, which for a test schema (tables and functions, but few rows) takes milliseconds, however long the schema took to build.

So `pg-dolly` builds the template once and clones it per test. Templates are named by the hash of their SQL and kept between runs, so a run usually builds nothing at all. The template is only trusted while it can't have changed:

- **Built under a temporary name and renamed when done.** A rename is atomic, so a template's real name never refers to a half-built database, even if the run building it crashes.
- **Built under an advisory lock on its name**, so two runs never build the same template at once: the second waits, then finds it built.
- **Marked `ALLOW_CONNECTIONS false`.** Nothing can connect to it and change it without first allowing connections again on purpose. A template that allows connections may have been changed, so `pg-dolly` drops it and builds it again rather than reusing it.

## Why the schema is SQL

An ORM's schema only knows what the ORM models. A trigger, a function or a view written by hand in a migration is invisible to it, so a test database built from the ORM's model is missing them. The schema `pg-dolly` takes is SQL: ideally a `pg_dump --schema-only` of what the migrations actually build, committed next to them (the `structure.sql` approach), so a PR's diff shows the real schema change, triggers included.

This also keeps `pg-dolly` free of any ORM. Running migrations is the one ORM-specific step, and it belongs to the tool the project already has.

## Sharing a server safely

Tests usually run against the same server as a developer's own databases, and many runs share it at once: parallel processes, other packages' tests, other branches. So:

- **It never touches what it didn't make.** Every database `pg-dolly` creates gets its prefix and a marker (a JSON comment on the database, with the prefix and the run it belongs to). It only ever drops databases that have both: a database that happens to start with the prefix is left alone. The one exception is a database with no comment and a name only `pg-dolly` gives (`<prefix>_<run>_<n>`), which a run that crashed between creating and marking it leaves; the name says which run, so its run lock shows whether it's gone.
- **Runs can tell whether another run is still going.** Each run's admin connection holds an advisory lock on its run id until it closes. Postgres releases it when the connection ends, crash or not. So a run that can take another run's lock knows that run is gone.
- **Templates in use are never dropped as unused.** A run holds a shared lock on every template it uses. Dropping an unused template needs that lock exclusively.
- **Clones are named by run**, so parallel runs never pick the same name.

## Cleaning up

- **When a run ends,** its clones are dropped all at once, rather than after each test (dropping a database forces a checkpoint, and doing that once per test adds up).
- **A failed test's clone is kept** to inspect, and its name printed. Kept clones are dropped by a later run once `retainMs` has passed, rather than by the very next run, so a run of another package's tests started right after doesn't drop it while someone is looking.
- **What a crashed run left behind** is dropped by the next run to connect: its run lock is free. `DROP DATABASE … WITH (FORCE)` also ends connections the crashed process left open.
- **Templates no run has used for `retainMs`** are dropped, so changing the schema over and over doesn't fill the server with old templates.


## Non-goals

- **Running migrations.** Each ORM has its own way (Drizzle's `migrate`, Prisma's `migrate deploy`, Kysely's `Migrator`). `template('')` gives an empty database to run them in, and [pg-dolly-schema](/packages/pg-dolly-schema/) runs a project's own migrate command in one to keep its `schema.sql`.
- **Providing the server.** It takes `DATABASE_URL`, and fails without it: leaving out integration tests should be a choice of which tests to run, not something that happens quietly.
- **Fixtures.** Data only some tests need is inserted by those tests, after cloning, so it's visible where it matters. Data every test needs can be a seed, run into the template once, but only as SQL: pg-dolly has to hash it to know when to build again.

## Compared to alternatives

- **[pgtestdb](https://github.com/peterldowns/pgtestdb)** (Go) is where the design comes from: templates named by a hash of the schema, a clone per test, kept on failure. `pg-dolly` hashes the SQL itself rather than taking a migrator, and adds the markers and run locks so parallel runs, and runs that crashed, clean up safely.
- **A transaction rolled back per test** is the cheapest per test, and fine for code that never commits, listens or races connections. See [above](#why-a-database-per-test).
- **[Testcontainers](https://testcontainers.com/)** starts a container (often one per test file or suite). It provides the server, which `pg-dolly` leaves to the environment (a devcontainer sidecar, a CI service). The two combine: a container as the server, `pg-dolly` for a database per test.
- **[PGlite](https://pglite.dev/)** runs Postgres in WebAssembly, in process, with nothing to install. A fresh instance per test is cheap, but it takes one connection at a time, so concurrent connections can't be tested, and it isn't the server production runs.
- **Writing it by hand** is common: migrate a template once, `CREATE DATABASE … TEMPLATE` per test. The pattern is simple. Making it safe next to dev data, between parallel runs, and after crashes is most of the work.
