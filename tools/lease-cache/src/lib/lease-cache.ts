import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { LeaseCacheDurationError, LeaseCacheValueError } from './errors.js';
import { fillScript, invalidateScript, readOrLeaseScript, releaseScript } from './scripts.js';

/**
 * Values are stored as JSON, so only JSON survives the round trip: a `Date` would come back as a string.
 */
export type Json =
    | boolean
    | number
    | string
    | readonly Json[]
    | { readonly [key: string]: Json }
    | null;

/**
 * The one command needed from a Valkey (or Redis) client. An ioredis `Redis` or `Cluster` fits as is.
 */
export interface LeaseCacheConnection {
    eval: (script: string, numKeys: number, ...args: (number | string)[]) => Promise<unknown>;
}

export interface LeaseCacheOptions {
    /**
     * Connection to run the scripts on. The cache never closes it.
     */
    readonly connection: LeaseCacheConnection;
    /**
     * Prefix of every key, so several caches can share a server.
     */
    readonly prefix: string;
    /**
     * How long a loaded value is cached, in milliseconds, unless `get` is given its own. Every duration is rounded
     * up to a whole millisecond.
     */
    readonly ttlMs: number;
    /**
     * How long a reader may load before its lease runs out and another reader can take over, in milliseconds.
     * Longer than a load usually takes. A load that outlives its lease still returns, but caches nothing.
     */
    readonly leaseMs: number;
    /**
     * How often a reader checks again while another reader loads, in milliseconds.
     */
    readonly pollMs: number;
    /**
     * How long a reader waits on another reader's load before loading itself, in milliseconds. It then caches
     * nothing, as it holds no lease. Bounds how long a stuck load can stall everyone else.
     */
    readonly waitMs: number;
    /**
     * After `invalidate()`, how long the old value is kept as stale, in milliseconds. A reader that would wait on
     * another reader's load returns the stale value instead, right away. Off (`0`) by default.
     *
     * Only for reads that accept data from before the last change. A stale value is only returned, never cached.
     */
    readonly staleMs?: number;
    /**
     * Called once for each read that finds another reader loading the key, and waits on it, e.g. to count how
     * many loads the leases saved.
     */
    readonly onWait?: (key: string) => void;
}

export interface GetOptions<T extends Json> {
    /**
     * How long the loaded value is cached, in milliseconds, in place of the cache's `ttlMs`. A function gets the
     * value, e.g. to cache a missing row for less time than a found one. Must be above 0.
     */
    readonly ttlMs?: number | ((value: T) => number);
}

/**
 * Where a value came from, and so whether it is cached:
 *
 * - `hit`: cached already
 * - `filled`: loaded with the lease, and cached
 * - `lost`: loaded, but the lease was lost (invalidated, or run out) before the value could be cached
 * - `stale`: kept by an invalidation, returned rather than waiting on another reader's load
 * - `timeout`: loaded without a lease, after waiting `waitMs` on another reader's load
 */
export type ReadSource = 'filled' | 'hit' | 'lost' | 'stale' | 'timeout';

/**
 * A value, and whether it is cached. A cache in front (e.g. a memory tier) should only keep a value for its
 * `ttlMs`: one that isn't cached may already be outdated, or soon be.
 *
 * @template T - The value
 */
export interface ReadResult<T extends Json> {
    readonly value: T;
    readonly source: ReadSource;
    /**
     * How much longer Valkey caches the value, in milliseconds. `0` when it isn't cached.
     */
    readonly ttlMs: number;
}

type GetOrLeaseResult =
    | readonly ['hit', string, number]
    | readonly ['lease']
    | readonly ['wait', string | null];

/**
 * Valkey takes whole milliseconds, so durations are rounded up.
 *
 * @param option - Name of the duration, for the error
 * @param value - Duration in milliseconds
 * @param minimum - Lowest valid value: `1`, or `0` where it means "off"
 * @returns Rounded duration
 * @throws {LeaseCacheDurationError} When not a finite number of at least `minimum`
 */
const duration = (option: string, value: number, minimum: 0 | 1): number => {
    const rounded = Math.ceil(value);
    if (!Number.isFinite(rounded) || rounded < minimum) {
        throw new LeaseCacheDurationError(option, value);
    }
    return rounded;
};

/**
 * Stores a loaded value as JSON.
 *
 * @param key - Identifies the value, for the error
 * @param value - Loaded value
 * @returns It, as JSON
 * @throws {LeaseCacheValueError} When it isn't JSON, e.g. `undefined`
 */
const serialize = (key: string, value: Json): string => {
    const serialized = JSON.stringify(value) as string | undefined;
    if (serialized === undefined) {
        throw new LeaseCacheValueError(key);
    }
    return serialized;
};

/**
 * A read-through cache on Valkey (or Redis) with leases, after memcache's leases at Facebook.
 *
 * A reader that misses takes a lease on the key, loads the value, then caches it only if it still holds the lease.
 * That one check gives two guarantees, across every instance sharing the server:
 *
 * - **One load per key at a time.** Other readers find the lease taken, and wait for the value rather than
 *   loading it too.
 * - **No outdated values after an invalidation.** `invalidate()` deletes the lease along with the value, so a load
 *   that started before it (and may have read the old data) can't cache what it read.
 */
export class LeaseCache {
    readonly #options: LeaseCacheOptions & { readonly staleMs: number };

    /**
     * @param options - Connection, and timing of values and leases
     * @throws {LeaseCacheDurationError} When a duration isn't a finite number above 0 (`waitMs` and `staleMs` may
     * be 0)
     */
    public constructor(options: LeaseCacheOptions) {
        this.#options = {
            ...options,
            ttlMs: duration('ttlMs', options.ttlMs, 1),
            leaseMs: duration('leaseMs', options.leaseMs, 1),
            pollMs: duration('pollMs', options.pollMs, 1),
            waitMs: duration('waitMs', options.waitMs, 0),
            staleMs: duration('staleMs', options.staleMs ?? 0, 0),
        };
    }

    /**
     * Returns the cached value, or calls `load` and caches what it returns.
     *
     * @param key - Identifies the value, without the prefix
     * @param load - Loads the value from the source of truth
     * @param options - How long to cache this value
     * @returns Cached or loaded value
     * @throws {LeaseCacheDurationError} When `ttlMs` isn't a finite number above 0
     * @throws {LeaseCacheValueError} When `load` returns something JSON can't store
     */
    public async get<T extends Json>(
        key: string,
        load: () => Promise<T>,
        options: GetOptions<T> = {}
    ): Promise<T> {
        const { value } = await this.read(key, load, options);
        return value;
    }

    /**
     * As `get`, and also says where the value came from, and how much longer it is cached. For a cache in front
     * of this one, which must not keep a value longer than this one does.
     *
     * @param key - Identifies the value, without the prefix
     * @param load - Loads the value from the source of truth
     * @param options - How long to cache this value
     * @returns Cached or loaded value, where it came from, and how long it is cached
     * @throws {LeaseCacheDurationError} When `ttlMs` isn't a finite number above 0
     * @throws {LeaseCacheValueError} When `load` returns something JSON can't store
     */
    public async read<T extends Json>(
        key: string,
        load: () => Promise<T>,
        options: GetOptions<T> = {}
    ): Promise<ReadResult<T>> {
        const { leaseMs, pollMs, waitMs } = this.#options;
        const { ttlMs = this.#options.ttlMs } = options;
        const keys = this.#keys(key);
        const token = randomUUID();
        const deadline = Date.now() + waitMs;
        let isWaiting = false;
        for (;;) {
            const [state, value, remainingMs] = (await this.#eval(
                readOrLeaseScript,
                keys,
                token,
                leaseMs
            )) as GetOrLeaseResult;

            if (state === 'hit') {
                return { value: JSON.parse(value) as T, source: 'hit', ttlMs: remainingMs };
            }

            if (state === 'lease') {
                let loaded: T;
                let serialized: string;
                let loadedTtlMs: number;
                try {
                    loaded = await load();
                    serialized = serialize(key, loaded);
                    loadedTtlMs = duration(
                        'ttlMs',
                        typeof ttlMs === 'function' ? ttlMs(loaded) : ttlMs,
                        1
                    );
                } catch (error) {
                    // Nothing will be cached, so free the lease for a waiting reader to take right away
                    await this.#eval(releaseScript, keys, token);
                    throw error;
                }
                // When the lease was lost, this caches nothing. What was loaded is still returned: it is as fresh
                // as when this read started.
                const filled = await this.#eval(fillScript, keys, token, serialized, loadedTtlMs);
                return filled === 1
                    ? { value: loaded, source: 'filled', ttlMs: loadedTtlMs }
                    : { value: loaded, source: 'lost', ttlMs: 0 };
            }

            if (value !== null) {
                // Stale, kept by an invalidation for readers that would otherwise wait
                return { value: JSON.parse(value) as T, source: 'stale', ttlMs: 0 };
            }
            if (Date.now() >= deadline) {
                return { value: await load(), source: 'timeout', ttlMs: 0 };
            }
            if (!isWaiting) {
                isWaiting = true;
                this.#options.onWait?.(key);
            }
            await setTimeout(pollMs);
        }
    }

    /**
     * Deletes a value, so the next read loads it. A load already in progress returns to its caller, but caches
     * nothing. Call after the source of truth changes.
     *
     * With `staleMs`, the old value is kept as stale for that long, for readers that would wait on the next load.
     *
     * @param key - Value to delete
     */
    public async invalidate(key: string): Promise<void> {
        await this.#eval(invalidateScript, this.#keys(key), this.#options.staleMs);
    }

    /**
     * The value's key, its lease's key and its stale value's key. The hash tag (`{...}`) puts all three on the
     * same node of a cluster, which the scripts need, since they touch several.
     *
     * @param key - Identifies the value, without the prefix
     * @returns Value key, lease key, then stale value key
     */
    #keys(key: string): readonly [string, string, string] {
        const tagged = `${this.#options.prefix}:{${key}}`;
        return [`${tagged}:value`, `${tagged}:lease`, `${tagged}:stale`];
    }

    async #eval(
        script: string,
        keys: readonly [string, string, string],
        ...args: (number | string)[]
    ): Promise<unknown> {
        return this.#options.connection.eval(script, keys.length, ...keys, ...args);
    }
}
