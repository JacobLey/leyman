---
"lease-cache": minor
---

`read(key, load, options)` returns `{ value, source, ttlMs }`: where the value came from, and how much longer Valkey caches it (`0` when it doesn't), so a memory tier in front keeps a value no longer than lease-cache does, and never keeps one it didn't cache. Errors now extend `LeaseCacheError`.
