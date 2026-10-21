# pg-dolly

## 0.1.0

### Minor Changes

- ad1d881: `dumpSchema(url, { data })` dumps the rows of the tables given too, after the schema, as `INSERT`s with the sequences they own set to match: for a migration tool's own table, so a database built from the dump knows its migrations ran.
- 38836cd: `dumpSchema(url)` dumps a database's schema with `pg_dump`, normalized so the same schema always gives the same text, and so `template()` (or any client) can run it. Options also accept `undefined`, for callers with `exactOptionalPropertyTypes`.
- 92dfdd2: `template(sql, { seed })` runs SQL after the schema, into the template, for data every test starts from. The seed is part of the template's hash, so a changed seed builds a new template.
- 7a53e51: A fresh Postgres database for every test, cloned from a template built once from the schema's SQL. Templates are kept between runs, named by the hash of the SQL. Only databases with its prefix and marker are ever dropped, a failed test's database can be kept to inspect, and what a crashed run left behind is dropped by the next run.
