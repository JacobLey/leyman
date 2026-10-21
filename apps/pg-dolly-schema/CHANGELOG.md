# pg-dolly-schema

## 0.1.0

### Minor Changes

- 42c8271: `--data <table>` keeps a table's rows in `schema.sql` too, e.g. the migration tool's own (`drizzle.__drizzle_migrations`), so a database built from the file knows its migrations ran, and migrating it does nothing.
- 7098ae6: `pg-dolly-schema --migrate <command>` keeps a `schema.sql` of what a project's migrations build: it migrates an empty database with the project's own command, dumps it, and writes the file, or in CI fails if the committed one is stale.

### Patch Changes

- Updated dependencies [ad1d881]
- Updated dependencies [38836cd]
- Updated dependencies [92dfdd2]
- Updated dependencies [7a53e51]
  - pg-dolly@0.1.0
