# lease-cache

## 0.1.0

### Minor Changes

- 43cbba4: Initial release: `new LeaseCache(options)` is a read-through cache on Valkey or Redis with memcache-style leases. `get(key, load)` loads a missing key once across every instance sharing the server: the first reader to miss takes a lease and loads, and the others wait for its value. `invalidate(key)` deletes the value and its lease together, so a load that started before it returns to its caller but never caches what it read. Works with any client that has `eval`, such as ioredis.
