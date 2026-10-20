---
"pg-dolly": minor
---

`dumpSchema(url)` dumps a database's schema with `pg_dump`, normalized so the same schema always gives the same text, and so `template()` (or any client) can run it. Options also accept `undefined`, for callers with `exactOptionalPropertyTypes`.
