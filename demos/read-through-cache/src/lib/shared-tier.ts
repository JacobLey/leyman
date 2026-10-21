import type { BentoStore } from 'bentocache';
import type { Redis } from 'ioredis';
import type { Binding } from 'haywire';
import type { GetOptions, Json, LeaseCacheOptions } from 'lease-cache';
import { LRUCache } from 'lru-cache';
import { bind, singletonScope } from 'haywire';
import { LeaseCache, LeaseCacheError } from 'lease-cache';
import { cacheConfigId, sharedTierId, valkeyTopologyId } from './ids.js';
import { ShardedValkeyDriver } from './sharded-valkey-driver.js';

/**
 * A value the shared tier loaded (or found), and how long the tiers in front may keep it.
 *
 * @template T - The value
 */
export interface SharedLoad<T extends Json> {
    readonly value: T;
    /**
     * How long the value is cached, in milliseconds. `0` when the shared tier didn't cache it, so it may already
     * be outdated: no tier keeps it.
     */
    readonly ttlMs: number;
}

/**
 * The tier every instance shares, in Valkey: where values live between instances, and how a miss is loaded.
 */
export interface SharedTier {
    /**
     * Adds the tier to BentoCache's store, when BentoCache manages it.
     */
    readonly layer: (store: BentoStore) => BentoStore;
    /**
     * Loads a value BentoCache missed, through the tier when it caches values itself.
     */
    readonly load: <T extends Json>(
        key: string,
        load: () => Promise<T>,
        options: GetOptions<T>
    ) => Promise<SharedLoad<T>>;
    /**
     * Deletes the key from the tier, when BentoCache doesn't manage it.
     */
    readonly invalidate: (key: string) => Promise<void>;
}

/**
 * BentoCache's own Valkey tier (through `ShardedValkeyDriver`). Each instance that misses a key loads it once,
 * and a load that finishes after an invalidation caches what it read until it expires.
 */
export const bentoValkeyTierBinding = bind(sharedTierId)
    .withDependencies([valkeyTopologyId, cacheConfigId])
    .withProvider(
        (topology, config): SharedTier => ({
            layer: store =>
                store.useL2Layer({
                    options: {},
                    // BentoCache passes its `prefix` option
                    factory: ({ prefix }: { prefix: string }) =>
                        new ShardedValkeyDriver(topology, prefix),
                }),
            // BentoCache writes what was loaded to this tier itself, for as long as it keeps it in memory
            load: async (_key, load, { ttlMs = config.ttlMs }) => {
                const value = await load();
                return { value, ttlMs: typeof ttlMs === 'function' ? ttlMs(value) : ttlMs };
            },
            // BentoCache deletes the key from its own tier
            invalidate: async () => {},
        })
    )
    .scoped(singletonScope);

export interface LeaseCacheFallbackOptions {
    /**
     * Most values each instance keeps in memory while Valkey is down, least recently used dropped first.
     */
    readonly maxItems: number;
    /**
     * How long each is kept, in milliseconds. Keep it short: while Valkey is down, invalidations from other
     * instances can't reach this one, so this is how long a changed value may still be served.
     */
    readonly ttlMs: number;
    /**
     * Called with each Valkey error a read falls back past.
     */
    readonly onUnavailable?: (error: unknown) => void;
}

export type LeaseCacheTierOptions = Pick<
    LeaseCacheOptions,
    'leaseMs' | 'onWait' | 'pollMs' | 'staleMs' | 'waitMs'
> & {
    /**
     * While Valkey is down, keep loaded values in each instance's memory, rather than fail every read.
     */
    readonly fallback?: LeaseCacheFallbackOptions;
};

/**
 * Lease-cache as the shared tier, in place of BentoCache's: a key missed by every instance is loaded once, and a
 * load that finishes after an invalidation caches nothing.
 *
 * BentoCache keeps only what lease-cache doesn't do: the memory tier, its sync, and grace periods. Stale values
 * are then only kept in memory, so stale-while-revalidate needs a memory tier. The exception is `staleMs`: after
 * an `expire()` or `invalidate()`, lease-cache keeps the old value for instances that would wait on the next load.
 *
 * @param options - Lease timing, and how long to keep stale values
 * @returns Binding for `sharedTierId`
 */
export const leaseCacheTierBinding = (
    options: LeaseCacheTierOptions
): Binding<typeof sharedTierId, [typeof valkeyTopologyId, typeof cacheConfigId], false> =>
    bind(sharedTierId)
        .withDependencies([valkeyTopologyId, cacheConfigId])
        .withProvider((topology, { prefix, ttlMs }): SharedTier => {
            const { fallback, ...leaseOptions } = options;
            // One lease cache per node: lease-cache works on one connection, and the topology picks it per key
            const caches = new WeakMap<Redis, LeaseCache>();
            const cacheFor = (key: string): LeaseCache => {
                const connection = topology.connectionFor(key);
                let cache = caches.get(connection);
                if (!cache) {
                    cache = new LeaseCache({ ...leaseOptions, connection, prefix, ttlMs });
                    caches.set(connection, cache);
                }
                return cache;
            };
            // Wrapped, as an LRU can't hold `null`
            const memory =
                fallback &&
                new LRUCache<string, { readonly value: Json }>({
                    max: fallback.maxItems,
                    ttl: fallback.ttlMs,
                });
            return {
                layer: store => store,
                load: async <T extends Json>(
                    key: string,
                    load: () => Promise<T>,
                    readOptions: GetOptions<T>
                ): Promise<SharedLoad<T>> => {
                    // Tells Valkey's errors from the loader's, and keeps what was loaded before Valkey failed
                    const attempt: { loaded?: { readonly value: T }; hasFailed: boolean } = {
                        hasFailed: false,
                    };
                    const tracked = async (): Promise<T> => {
                        try {
                            const value = await load();
                            attempt.loaded = { value };
                            return value;
                        } catch (error) {
                            attempt.hasFailed = true;
                            throw error;
                        }
                    };
                    try {
                        // How long lease-cache keeps the value, so memory keeps it no longer, and never keeps one
                        // lease-cache didn't cache (a load that lost its lease, a stale value)
                        return await cacheFor(key).read(key, tracked, readOptions);
                    } catch (error) {
                        if (!memory || attempt.hasFailed || error instanceof LeaseCacheError) {
                            throw error;
                        }
                        fallback.onUnavailable?.(error);
                        // A key holds the same kind of value on every read (see `resource()`). Not set again on a
                        // hit, which would restart its TTL: a value read often would never expire.
                        const kept = memory.get(key) as { readonly value: T } | undefined;
                        if (kept && !attempt.loaded) {
                            return { value: kept.value, ttlMs: 0 };
                        }
                        const value = attempt.loaded ? attempt.loaded.value : await load();
                        memory.set(key, { value });
                        // Kept by the fallback alone: BentoCache's tiers would keep it past an invalidation
                        return { value, ttlMs: 0 };
                    }
                },
                invalidate: async key => {
                    // Dropped from memory even when Valkey is down, which the invalidation then rejects for
                    memory?.delete(key);
                    await cacheFor(key).invalidate(key);
                },
            };
        })
        .scoped(singletonScope);
