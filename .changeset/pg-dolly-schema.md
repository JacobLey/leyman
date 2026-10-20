---
"pg-dolly-schema": minor
---

`pg-dolly-schema --migrate <command>` keeps a `schema.sql` of what a project's migrations build: it migrates an empty database with the project's own command, dumps it, and writes the file, or in CI fails if the committed one is stale.
