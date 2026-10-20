/**
 * Lua scripts, each run atomically by Valkey. `KEYS[1]` is the value, `KEYS[2]` the lease, `KEYS[3]` the stale
 * value, and all share a hash tag, so they live on the same node of a cluster.
 */

/**
 * Returns `{'hit', value}` when the value is cached. Otherwise takes the lease with `ARGV[1]` (the token) for
 * `ARGV[2]` milliseconds, returning `{'lease'}`, unless another reader holds it: `{'wait', stale}`, with the stale
 * value if one is kept (`false` otherwise).
 */
export const readOrLeaseScript = `
local value = redis.call('GET', KEYS[1])
if value then
    return {'hit', value}
end
if redis.call('SET', KEYS[2], ARGV[1], 'PX', ARGV[2], 'NX') then
    return {'lease'}
end
return {'wait', redis.call('GET', KEYS[3])}
`;

/**
 * Caches `ARGV[2]` for `ARGV[3]` milliseconds and frees the lease, only if the lease still holds `ARGV[1]` (our
 * token), and drops any stale value, now replaced. Returns 1 when cached, 0 when the lease was lost: invalidated, or run out and taken by another reader.
 *
 * Checking and writing in one step is the point: a load that started before an invalidation can't cache what it
 * read, because the invalidation deleted its lease.
 */
export const fillScript = `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then
    return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
redis.call('DEL', KEYS[2], KEYS[3])
return 1
`;

/**
 * Frees the lease, only if it still holds `ARGV[1]` (our token): one that ran out may belong to someone else.
 */
export const releaseScript = `
if redis.call('GET', KEYS[2]) == ARGV[1] then
    redis.call('DEL', KEYS[2])
end
return 0
`;

/**
 * Deletes the value and the lease. With `ARGV[1]` (`staleMs`) above 0, first keeps the value as stale for that many
 * milliseconds, for readers that would otherwise wait on the next load.
 *
 * Deleting the lease is what stops a load in progress from caching what it read: its fill no longer finds its token.
 */
export const invalidateScript = `
local value = redis.call('GET', KEYS[1])
if value and tonumber(ARGV[1]) > 0 then
    redis.call('SET', KEYS[3], value, 'PX', ARGV[1])
end
redis.call('DEL', KEYS[1], KEYS[2])
return 0
`;
