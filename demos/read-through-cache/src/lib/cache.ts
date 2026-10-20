import type { GetOptions, Json } from 'lease-cache';
import type { ReadThroughBentoCache } from './ids.js';
import type { ResourceOptions } from './resource.js';
import type { SharedTier } from './shared-tier.js';
import { BentoCache, bentostore } from 'bentocache';
import { bind, createModule, singletonScope } from 'haywire';
import { bentoCacheId, cacheConfigId, expiryPolicyId, memoryTierId, sharedTierId } from './ids.js';
import { Resource } from './resource.js';

/**
 * A read-through cache: reads that miss load the value, and cache it for later reads.
 */
export class ReadThroughCache {
    readonly #bento: ReadThroughBentoCache;
    readonly #sharedTier: SharedTier;

    /**
     * @param bento - BentoCache, with the chosen tiers and expiry
     * @param sharedTier - The tier every instance shares, and how it loads a miss
     */
    public constructor(bento: ReadThroughBentoCache, sharedTier: SharedTier) {
        this.#bento = bento;
        this.#sharedTier = sharedTier;
    }

    /**
     * Defines a kind of value, read by input: its key and loader are given once, rather than at every read.
     *
     * @param options - Key, loader and TTL
     * @returns Resource, to read and invalidate values by input
     */
    public resource<Input, T extends Json>(options: ResourceOptions<Input, T>): Resource<Input, T> {
        return new Resource(this, options);
    }

    /**
     * Returns the cached value, or calls `load` and caches what it returns. Prefer `resource()`, which derives the
     * key from the input, so a key can't be read with the loader of something else.
     *
     * @param key - Identifies the value, without the prefix
     * @param load - Loads the value from the source of truth
     * @param options - How long to cache this value, in place of the cache's `ttlMs`
     * @returns Cached or loaded value
     */
    public async get<T extends Json>(
        key: string,
        load: () => Promise<T>,
        options: GetOptions<T> = {}
    ): Promise<T> {
        const { ttlMs } = options;
        return this.#bento.getOrSet<T>({
            key,
            factory: async ctx => {
                const value = await this.#sharedTier.load(key, load, options);
                if (ttlMs !== undefined) {
                    // Every tier BentoCache writes keeps the value this long
                    ctx.setOptions({ ttl: typeof ttlMs === 'function' ? ttlMs(value) : ttlMs });
                }
                return value;
            },
        });
    }

    /**
     * Marks a value stale. With stale-while-revalidate, the next read still returns it while a fresh one loads.
     * Otherwise, the same as `invalidate`.
     *
     * @param key - Value to mark stale
     */
    public async expire(key: string): Promise<void> {
        await Promise.all([this.#bento.expire({ key }), this.#sharedTier.invalidate(key)]);
    }

    /**
     * Deletes a value, so the next read loads it.
     *
     * @param key - Value to delete
     */
    public async invalidate(key: string): Promise<void> {
        await Promise.all([this.#bento.delete({ key }), this.#sharedTier.invalidate(key)]);
    }
}

const bentoCacheBinding = bind(bentoCacheId)
    .withDependencies([cacheConfigId, sharedTierId, memoryTierId, expiryPolicyId])
    .withProvider((config, sharedTier, memoryTier, expiry) => {
        const store = memoryTier(sharedTier.layer(bentostore()));
        return new BentoCache({
            // The bus publishes on a channel named after the store. Messages are tagged with the prefix, so other
            // caches already ignore them, but naming the store after the prefix spares them receiving them at all.
            default: config.prefix,
            stores: { [config.prefix]: store },
            prefix: config.prefix,
            ttl: config.ttlMs,
            grace: expiry.graceMs,
            // Return a stale value right away, rather than waiting a while for the fresh one first
            timeout: 0,
            ...(config.onLoadError && { onFactoryError: config.onLoadError }),
            ...(config.emitter && { emitter: config.emitter }),
        });
    })
    .scoped(singletonScope)
    // Closes what BentoCache opened (the bus's connections). Valkey connections belong to the app.
    .withDisposer(async bento => bento.disconnect());

const readThroughCacheBinding = bind(ReadThroughCache)
    .withDependencies([bentoCacheId, sharedTierId])
    .withConstructorProvider()
    .scoped(singletonScope);

/**
 * The cache, without its features. Add one binding for each of:
 *
 * - `cacheConfigId`: the app's settings
 * - `valkeyTopologyId`: `singleNodeTopologyBinding` (needs `valkeyConnectionId`), `shardedTopologyBinding` (needs
 *   a `valkeyShardId` per node), or a `ResizableValkeyTopology` instance
 * - `sharedTierId`: `bentoValkeyTierBinding` or `leaseCacheTierBinding()`
 * - `memoryTierId`: `noMemoryTierBinding`, `memoryTierBinding()` or `syncedMemoryTierBinding()`
 * - `expiryPolicyId`: `waitForFreshBinding` or `staleWhileRevalidateBinding()`
 *
 * Disposing the container closes what BentoCache opened (the bus's connections), and never the app's
 * Valkey connections.
 */
export const readThroughCacheModule =
    createModule(readThroughCacheBinding).addBinding(bentoCacheBinding);
