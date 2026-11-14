---
"pg-dolly": minor
---

Reject a `retainMs` that isn't a finite number of at least 0 with the new `PgDollyRetainMsError`. Before, `NaN` silently turned off dropping old templates and kept clones, and a negative number dropped kept clones on the next run.
