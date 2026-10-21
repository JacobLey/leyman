---
description: How pg-dolly builds templates, clones them, marks what it made, tells live runs from crashed ones, and cleans up.
---

# How it works

## Templates

`template(sql)` hashes the SQL and looks for a template with that name (`<prefix>_t_<hash>`). If none exists:

1. It creates a database from `template0` under a temporary name, and runs the SQL in it.
2. It marks it as a template nothing can connect to: `IS_TEMPLATE true ALLOW_CONNECTIONS false`.
3. It renames it to the real name. A rename is atomic, so a half-built template never has the real name, even if the run building it crashes.

Runs building the same template wait for each other on an advisory lock on its name, then find it built. A template that allows connections may have been changed since it was built, so it is dropped and built again rather than reused.

If the SQL fails, `template()` rejects with the error from Postgres. Nothing is left behind, and the next call tries again.

## Clones

`clone()` is `CREATE DATABASE … TEMPLATE`, which copies the template's data rather than running the SQL again. Its cost depends on the size of the template (small, for a schema with few rows), not on what it took to build it.

Clones are named by run (`<prefix>_<run>_<n>`), so parallel runs never pick the same name. Each gets `TimeZone` set, since a clone doesn't inherit the template's database settings.

## Markers

Every database pg-dolly creates has the prefix _and_ a marker: a JSON comment on the database, with the prefix and the run it belongs to. It only ever drops databases that have both. A database that happens to start with the prefix is left alone.

## Runs

Tests usually share a server with a developer's own databases, and many runs share it at once: parallel processes, other packages' tests, other branches. So:

- **Each `PgDolly` holds an advisory lock on its own run id** until it closes. Postgres releases it when the connection ends, crash or not. A run that can take another run's lock knows that run is gone.
- **Each run holds a shared lock on every template it uses.** Dropping an unused template needs that lock exclusively, so no run drops a template another is cloning.

## Cleanup

- **`close()`** drops this run's clones, except those kept, all at once rather than after each test (dropping a database forces a checkpoint, and once per test adds up).
- **`connect()`** drops what other runs left behind: the clones of runs that ended without closing, templates no run has used for `retainMs`, and kept clones older than `retainMs`.
- Each drop is `DROP DATABASE … WITH (FORCE)`, which also ends connections a test (or a crashed process) left open.

Kept clones wait for `retainMs`, rather than the very next run, so another package's tests started right after don't drop a database someone is looking at.

::: info One gap
`CREATE DATABASE` can't set a comment in the same step, so a crash right between creating a clone and marking it leaves a database no run will drop. It has the prefix, so it's easy to find, and resetting a server used only for tests clears it.
:::

## Speed

Measured on a laptop (Postgres 18.6 in Docker), for schemas where each table has a primary key, an index and a foreign key:

| Tables | Build the template (once) | Clone (per test) | Drop at `close()` (per test) |
|---|---|---|---|
| 10 | 20-45 ms | 7-14 ms | 2 ms |
| 100 | 70 ms | 13-24 ms | 2 ms |
| 500 | 300 ms | 50-60 ms | 3 ms |

Connecting to a clone and running a first query takes another 4 ms or so.

These are for a server with durability off (`fsync`, `synchronous_commit` and `full_page_writes`), which is how a test server should run. With Postgres's defaults, clones take about twice as long, and each drop waits for a checkpoint that writes the clone to disk: 0.2 s per test for 10 tables, and over a second for 500, all of it spent in `close()`. Dropping in parallel doesn't help much: the time goes to writing the clones out, which the first checkpoint does either way.

```sh
docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:18 \
    -c fsync=off -c synchronous_commit=off -c full_page_writes=off
```
