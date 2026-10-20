import type { BentoStore } from 'bentocache';
import type { GetSetFactory } from 'bentocache/types';
import type { Redis } from 'ioredis';
import type { Binding } from 'haywire';
import type { Json, LeaseCacheOptions } from 'lease-cache';
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
     * Turns a loader into the BentoCache factory that runs it on a miss.
     */
    readonly factory: <T extends Json>(key: string, load: () => Promise<T>) => GetSetFactory<T>;
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
            factory: (_key, load) => async () => load(),
            // BentoCache deletes the key from its own tier
            invalidate: async () => {},
        })
    )
    .scoped(singletonScope);

export type LeaseCacheTierOptions = Pick<
    LeaseCacheOptions,
    'leaseMs' | 'onWait' | 'pollMs' | 'waitMs'
>;

/**
 * Lease-cache as the shared tier, in place of BentoCache's: a key missed by every instance is loaded once, and a
 * load that finishes after an invalidation caches nothing.
 *
 * BentoCache keeps only what lease-cache doesn't do: the memory tier, its sync, and grace periods. Stale values
 * are then only kept in memory, so stale-while-revalidate needs a memory tier.
 *
 * @param options - Lease timing
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
                factory: (key, load) => async () => cacheFor(key).get(key, load),
                invalidate: async key => cacheFor(key).invalidate(key),
            };
        })
        .scoped(singletonScope);
