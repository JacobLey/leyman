---
"pg-dolly": minor
---

`dumpSchema(url, { data })` dumps the rows of the tables given too, after the schema, as `INSERT`s with the sequences they own set to match: for a migration tool's own table, so a database built from the dump knows its migrations ran.
