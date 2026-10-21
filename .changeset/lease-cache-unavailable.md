---
"lease-cache": minor
---

`onUnavailable(error, key)` keeps reads working while Valkey is down: a read that hits a Valkey error reports it, and loads the value without caching it (`source: 'unavailable'`). Without it, reads reject as before. `invalidate()` always rejects when Valkey fails. A failed load now rejects with the loader's error even when freeing its lease fails too.
