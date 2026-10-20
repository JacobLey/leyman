import type { BentoStore } from 'bentocache';
import type { Redis } from 'ioredis';
import type { Binding } from 'haywire';
import type { GetOptions, Json, LeaseCacheOptions } from 'lease-cache';
import { bind, singletonScope } from 'haywire';
import { LeaseCache } from 'lease-cache';
import { cacheConfigId, sharedTierId, valkeyTopologyId } from './ids.js';
import { ShardedValkeyDriver } from './sharded-valkey-driver.js';

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
    ) => Promise<T>;
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
    .withDependencies([valkeyTopologyId])
    .withProvider(
        (topology): SharedTier => ({
            layer: store =>
                store.useL2Layer({
                    options: {},
                    // BentoCache passes its `prefix` option
                    factory: ({ prefix }: { prefix: string }) =>
                        new ShardedValkeyDriver(topology, prefix),
                }),
            // BentoCache writes what was loaded to this tier itself
            load: async (_key, load) => load(),
            // BentoCache deletes the key from its own tier
            invalidate: async () => {},
        })
    )
    .scoped(singletonScope);

export type LeaseCacheTierOptions = Pick<
    LeaseCacheOptions,
    'leaseMs' | 'onWait' | 'pollMs' | 'staleMs' | 'waitMs'
>;

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
            // One lease cache per node: lease-cache works on one connection, and the topology picks it per key
            const caches = new WeakMap<Redis, LeaseCache>();
            const cacheFor = (key: string): LeaseCache => {
                const connection = topology.connectionFor(key);
                let cache = caches.get(connection);
                if (!cache) {
                    cache = new LeaseCache({ ...options, connection, prefix, ttlMs });
                    caches.set(connection, cache);
                }
                return cache;
            };
            return {
                layer: store => store,
                load: async (key, load, readOptions) => cacheFor(key).get(key, load, readOptions),
                invalidate: async key => cacheFor(key).invalidate(key),
            };
        })
        .scoped(singletonScope);
