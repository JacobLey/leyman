import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
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
     * How long a loaded value is cached, in milliseconds, unless `get` is given its own.
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
     * Called each time a reader finds another reader loading the key, and waits, e.g. to count how many loads
     * the leases saved.
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

type GetOrLeaseResult =
    | readonly ['hit', string]
    | readonly ['lease']
    | readonly ['wait', string | null];

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
    readonly #options: LeaseCacheOptions;

    /**
     * @param options - Connection, and timing of values and leases
     */
    public constructor(options: LeaseCacheOptions) {
        this.#options = options;
    }

    /**
     * Returns the cached value, or calls `load` and caches what it returns.
     *
     * @param key - Identifies the value, without the prefix
     * @param load - Loads the value from the source of truth
     * @param options - How long to cache this value
     * @returns Cached or loaded value
     */
    public async get<T extends Json>(
        key: string,
        load: () => Promise<T>,
        options: GetOptions<T> = {}
    ): Promise<T> {
        const { leaseMs, pollMs, waitMs } = this.#options;
        const { ttlMs = this.#options.ttlMs } = options;
        const keys = this.#keys(key);
        const token = randomUUID();
        const deadline = Date.now() + waitMs;
        for (;;) {
            const [state, value] = (await this.#eval(
                readOrLeaseScript,
                keys,
                token,
                leaseMs
            )) as GetOrLeaseResult;

            if (state === 'hit') {
                return JSON.parse(value) as T;
            }

            if (state === 'lease') {
                let loaded: T;
                try {
                    loaded = await load();
                } catch (error) {
                    // Nothing will be cached, so free the lease for a waiting reader to take right away
                    await this.#eval(releaseScript, keys, token);
                    throw error;
                }
                // When the lease was lost, this caches nothing. What was loaded is still returned: it is as fresh
                // as when this read started.
                await this.#eval(
                    fillScript,
                    keys,
                    token,
                    JSON.stringify(loaded),
                    typeof ttlMs === 'function' ? ttlMs(loaded) : ttlMs
                );
                return loaded;
            }

            if (value !== null) {
                // Stale, kept by an invalidation for readers that would otherwise wait
                return JSON.parse(value) as T;
            }
            if (Date.now() >= deadline) {
                return load();
            }
            this.#options.onWait?.(key);
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
        await this.#eval(invalidateScript, this.#keys(key), this.#options.staleMs ?? 0);
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
