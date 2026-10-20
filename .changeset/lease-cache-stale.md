---
"lease-cache": minor
---

With `staleMs`, `invalidate(key)` keeps the old value as stale for that long, and readers that would wait on the next load return it right away. The lease holder still loads, and its fill deletes the stale value, so a stale value is never older than one cached since.
