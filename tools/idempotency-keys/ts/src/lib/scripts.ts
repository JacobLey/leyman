/**
 * The Valkey store's scripts, which every implementation sends byte for byte (the test vectors hold them).
 */

/**
 * `KEYS[1]` record; `ARGV` fingerprint, token, leaseMs, ttlMs. Returns `{'claimed'}`, `{'running', fingerprint}`
 * or `{'completed', fingerprint, status, headers, body}`.
 */
export const claimScript = `local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local record = redis.call('HMGET', KEYS[1], 'fingerprint', 'lease', 'status', 'headers', 'body')
if record[3] then
    return {'completed', record[1], record[3], record[4], record[5]}
end
if record[1] and (record[1] ~= ARGV[1] or tonumber(record[2]) > now) then
    return {'running', record[1]}
end
redis.call('DEL', KEYS[1])
redis.call('HSET', KEYS[1], 'fingerprint', ARGV[1], 'token', ARGV[2], 'lease', string.format('%d', now + tonumber(ARGV[3])))
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return {'claimed'}
`;

/**
 * `KEYS[1]` record; `ARGV` token, status, headers, body. Returns `1` if it stored the response.
 */
export const completeScript = `if redis.call('HGET', KEYS[1], 'token') ~= ARGV[1] then
    return 0
end
redis.call('HDEL', KEYS[1], 'token', 'lease')
redis.call('HSET', KEYS[1], 'status', ARGV[2], 'headers', ARGV[3], 'body', ARGV[4])
return 1
`;

/**
 * `KEYS[1]` record; `ARGV` token. Returns `1` if it deleted the record.
 */
export const releaseScript = `if redis.call('HGET', KEYS[1], 'token') ~= ARGV[1] then
    return 0
end
redis.call('DEL', KEYS[1])
return 1
`;
