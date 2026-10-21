---
"pg-dolly-schema": minor
---

`--data <table>` keeps a table's rows in `schema.sql` too, e.g. the migration tool's own (`drizzle.__drizzle_migrations`), so a database built from the file knows its migrations ran, and migrating it does nothing.
