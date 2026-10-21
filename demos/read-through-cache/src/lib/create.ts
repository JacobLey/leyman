import type { Redis } from 'ioredis';
import type { CacheConfig } from './ids.js';
import type { LeaseCacheTierOptions } from './shared-tier.js';
import type { ValkeyShard } from './topology.js';
import { bind, createContainer } from 'haywire';
import { ReadThroughCache, readThroughCacheModule } from './cache.js';
import { staleWhileRevalidateBinding, waitForFreshBinding } from './expiry.js';
import { cacheConfigId, valkeyConnectionId, valkeyTopologyId } from './ids.js';
import { memoryTierBinding, noMemoryTierBinding, syncedMemoryTierBinding } from './memory-tier.js';
import { bentoValkeyTierBinding, leaseCacheTierBinding } from './shared-tier.js';
import { rendezvousTopology, singleNodeTopologyBinding } from './topology.js';

export interface ReadThroughCacheOptions extends CacheConfig {
    /**
     * A Valkey connection the app already has. The cache stores values on it (unless `shards` are given), and
     * syncs memory tiers through it. Never closed by the cache.
     */
    readonly connection: Redis;
    /**
     * Spreads keys over these nodes instead, by weighted rendezvous hashing. Never closed by the cache.
     */
    readonly shards?: readonly ValkeyShard[];
    /**
     * With `shards`, invalidate each key on every node rather than only on its own, so a change to the nodes can
     * roll out without serving invalidated values (see `TopologyOptions`).
     */
    readonly invalidateEveryNode?: boolean;
    /**
     * Keeps copies in each instance's memory. With `sync`, an instance drops its copy when any instance writes,
     * expires or invalidates the key.
     */
    readonly memory?: { readonly maxItems: number; readonly sync?: boolean };
    /**
     * Once a value expires, keep serving it while a fresh one loads, for up to `graceMs` after it was loaded.
     */
    readonly staleWhileRevalidate?: { readonly graceMs: number };
    /**
     * Loads each miss once across every instance, and never caches a load that finishes after an invalidation,
     * with lease-cache. Without it, BentoCache's own Valkey tier loads a miss once per instance.
     */
    readonly leases?: LeaseCacheTierOptions;
}

export interface CreatedReadThroughCache {
    readonly cache: ReadThroughCache;
    /**
     * Closes what the cache opened (the bus's connections). The app's connections stay open.
     */
    readonly close: () => Promise<void>;
}

/**
 * Creates a cache from plain options. Each option picks one of the bindings `readThroughCacheModule` is composed
 * from: compose the module directly to swap in your own, or to resize the nodes while running.
 *
 * @param options - Settings, connections and features
 * @returns The cache, and how to close it
 */
export const createReadThroughCache = (
    options: ReadThroughCacheOptions
): CreatedReadThroughCache => {
    const {
        connection,
        shards,
        invalidateEveryNode,
        memory,
        staleWhileRevalidate,
        leases,
        ...config
    } = options;

    // Every feature off, then each option swaps in its binding. Each replacement keeps the module's type, so
    // haywire still checks that every combination is complete.
    let module = readThroughCacheModule
        .addBinding(bind(cacheConfigId).withInstance(config))
        .addBinding(bind(valkeyConnectionId).withInstance(connection))
        .addBinding(singleNodeTopologyBinding)
        .addBinding(noMemoryTierBinding)
        .addBinding(waitForFreshBinding)
        .addBinding(bentoValkeyTierBinding);
    if (shards) {
        module = module.replaceBinding(
            bind(valkeyTopologyId).withInstance(
                rendezvousTopology(shards, invalidateEveryNode ? { invalidateEveryNode } : {})
            )
        );
    }
    if (memory) {
        module = module.replaceBinding(
            (memory.sync ? syncedMemoryTierBinding : memoryTierBinding)({
                maxItems: memory.maxItems,
            })
        );
    }
    if (staleWhileRevalidate) {
        module = module.replaceBinding(staleWhileRevalidateBinding(staleWhileRevalidate));
    }
    if (leases) {
        module = module.replaceBinding(leaseCacheTierBinding(leases));
    }

    const container = createContainer(module);
    return {
        cache: container.get(ReadThroughCache),
        close: async () => container[Symbol.asyncDispose](),
    };
};
