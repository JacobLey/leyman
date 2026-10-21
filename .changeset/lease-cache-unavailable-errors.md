---
"lease-cache": patch
---

With `onUnavailable`, only Valkey's own errors count as Valkey failing. An error thrown by a `ttlMs` function or by `onWait` used to be reported to `onUnavailable` as if Valkey were down, and the read returned the value without caching it (`source: 'unavailable'`). The read now rejects with that error, as it does without `onUnavailable`.
