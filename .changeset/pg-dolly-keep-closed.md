---
"pg-dolly": patch
---

`keep()` throws `PgDollyClosedError` once `close()` is called, rather than printing that it kept a database `close()` dropped.
