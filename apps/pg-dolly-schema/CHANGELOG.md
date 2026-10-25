# pg-dolly-schema

## 0.1.2

### Patch Changes

- 1796f85: Docs name `PopulateFilesCheckError` as the error of a failed check.
- 7e4c3b2: `homepage` points at the package's docs site page, which the README links too.
- 4234726: The CLI prints only the message of an expected failure (a failed migration, a missing `DATABASE_URL`, an outdated file with `--check`), without a stack trace, and exits with code 1.
- 8ca7953: Document in the README and `snapshotSchema()`'s JSDoc the errors that come from `pg-dolly` and `pg_dump`, and fix the link to `dumpSchema()`.
- Updated dependencies [dc1bbaa]
- Updated dependencies [4c6cc67]
- Updated dependencies [bfbffcf]
- Updated dependencies [7e4c3b2]
- Updated dependencies [86e2c1f]
- Updated dependencies [d8baa7e]
- Updated dependencies [bdde13d]
- Updated dependencies [6f2cb13]
- Updated dependencies [772efd5]
  - entry-script@4.1.2
  - haywire@2.0.4
  - haywire-launcher@1.1.1
  - pg-dolly@0.2.1
  - populate-files@1.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [c610446]
- Updated dependencies [bec61e6]
- Updated dependencies [957ab53]
- Updated dependencies [107dea6]
- Updated dependencies [995c22e]
- Updated dependencies [4cbf98a]
- Updated dependencies [ebb730f]
- Updated dependencies [5d573ca]
- Updated dependencies [9da6083]
- Updated dependencies [9da6083]
- Updated dependencies [975c05d]
  - entry-script@4.1.1
  - haywire@2.0.2
  - haywire-launcher@1.1.0
  - pg-dolly@0.2.0
  - populate-files@1.1.2

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
