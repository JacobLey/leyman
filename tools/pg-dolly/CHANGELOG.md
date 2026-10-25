# pg-dolly

## 0.2.1

### Patch Changes

- 7e4c3b2: `homepage` points at the package's docs site page, which the README links too.
- 86e2c1f: Document in the README that `connect()` and `dumpSchema()` reject rather than throw, that `template()` rejects after `close()`, and which types are exported.

## 0.2.0

### Minor Changes

- 9da6083: `settings` replaces `timeZone`: every database pg-dolly creates, the template while it is built included, gets the same database settings. The defaults (`defaultSettings`) pin what `initdb` takes from the machine (`TimeZone`, `DateStyle`, `lc_monetary`, `lc_numeric`, `lc_time` and `default_text_search_config`), so the server's configuration doesn't change what queries return. Settings are part of the template's hash, and an invalid one fails `template()` rather than every clone.

### Patch Changes

- ebb730f: `keep()` throws `PgDollyClosedError` once `close()` is called, rather than printing that it kept a database `close()` dropped.
- 5d573ca: Treat setting names as case-insensitive, as Postgres does. `settings: { TIMEZONE: 'America/New_York' }` used to be overridden by the default `TimeZone: 'UTC'`, as both were set and the default sorted last. Templates are built once again, as the names in their hash are now lowercase.
- 9da6083: A database a run crashed between creating and marking is dropped like the rest of what the run left: its name, with no comment, still says which run made it.

## 0.1.0

### Minor Changes

- ad1d881: `dumpSchema(url, { data })` dumps the rows of the tables given too, after the schema, as `INSERT`s with the sequences they own set to match: for a migration tool's own table, so a database built from the dump knows its migrations ran.
- 38836cd: `dumpSchema(url)` dumps a database's schema with `pg_dump`, normalized so the same schema always gives the same text, and so `template()` (or any client) can run it. Options also accept `undefined`, for callers with `exactOptionalPropertyTypes`.
- 92dfdd2: `template(sql, { seed })` runs SQL after the schema, into the template, for data every test starts from. The seed is part of the template's hash, so a changed seed builds a new template.
- 7a53e51: A fresh Postgres database for every test, cloned from a template built once from the schema's SQL. Templates are kept between runs, named by the hash of the SQL. Only databases with its prefix and marker are ever dropped, a failed test's database can be kept to inspect, and what a crashed run left behind is dropped by the next run.
