---
"lease-cache": patch
---

Durations are rounded up to whole milliseconds, and invalid ones throw `LeaseCacheDurationError`, rather than failing in Valkey after the value was loaded, with the lease left held. A loader that returns `undefined` rejects with `LeaseCacheValueError` rather than caching a value every later read failed to parse. `onWait` is called once per wait, not on every check.
