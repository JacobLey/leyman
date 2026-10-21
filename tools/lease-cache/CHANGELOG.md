# lease-cache

## 0.2.0

### Minor Changes

- 21cda78: `get(key, load, { ttlMs })` caches one value for its own time, or for a time computed from the value.
- 07ddc29: `read(key, load, options)` returns `{ value, source, ttlMs }`: where the value came from, and how much longer Valkey caches it (`0` when it doesn't), so a memory tier in front keeps a value no longer than lease-cache does, and never keeps one it didn't cache. Errors now extend `LeaseCacheError`.
- fdef14e: With `staleMs`, `invalidate(key)` keeps the old value as stale for that long, and readers that would wait on the next load return it right away. The lease holder still loads, and its fill deletes the stale value, so a stale value is never older than one cached since.
- a66f0fd: `onUnavailable(error, key)` keeps reads working while Valkey is down: a read that hits a Valkey error reports it, and loads the value without caching it (`source: 'unavailable'`). Without it, reads reject as before. `invalidate()` always rejects when Valkey fails. A failed load now rejects with the loader's error even when freeing its lease fails too.

### Patch Changes

- 07ddc29: Durations are rounded up to whole milliseconds, and invalid ones throw `LeaseCacheDurationError`, rather than failing in Valkey after the value was loaded, with the lease left held. A loader that returns `undefined` rejects with `LeaseCacheValueError` rather than caching a value every later read failed to parse. `onWait` is called once per wait, not on every check.

## 0.1.0

### Minor Changes

- 43cbba4: Initial release: `new LeaseCache(options)` is a read-through cache on Valkey or Redis with memcache-style leases. `get(key, load)` loads a missing key once across every instance sharing the server: the first reader to miss takes a lease and loads, and the others wait for its value. `invalidate(key)` deletes the value and its lease together, so a load that started before it returns to its caller but never caches what it read. Works with any client that has `eval`, such as ioredis.
