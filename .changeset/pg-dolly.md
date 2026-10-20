---
"pg-dolly": minor
---

A fresh Postgres database for every test, cloned from a template built once from the schema's SQL. Templates are kept between runs, named by the hash of the SQL. Only databases with its prefix and marker are ever dropped, a failed test's database can be kept to inspect, and what a crashed run left behind is dropped by the next run.
