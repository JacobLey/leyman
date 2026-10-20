import type { BentoCache, BentoStore } from 'bentocache';
import type { Emitter } from 'bentocache/types';
import type { SharedTier } from './shared-tier.js';
import type { ValkeyShard, ValkeyTopology } from './topology.js';
import { Redis } from 'ioredis';
import { identifier } from 'haywire';

/**
 * Settings every cache needs, whichever features it is built with.
 */
export interface CacheConfig {
    /**
     * Prefix of every key, so several caches can share nodes.
     */
    readonly prefix: string;
    /**
     * How long a loaded value is fresh, in milliseconds.
     */
    readonly ttlMs: number;
    /**
     * Called when a load fails, including background refreshes, whose errors no caller sees. The error is
     * BentoCache's `FactoryError`, whose `cause` is what the loader threw.
     */
    readonly onLoadError?: (error: Error) => void;
    /**
     * Receives BentoCache's events (`cache:hit`, `cache:miss`, `cache:written`, `bus:message:received`...),
     * e.g. for metrics.
     */
    readonly emitter?: Emitter;
}

/**
 * Adds an in-memory tier (or not) to the store, which already has its Valkey tier.
 */
export type MemoryTier = (store: BentoStore) => BentoStore;

/**
 * How long BentoCache keeps an entry after it expires, to serve while refreshing. `false` keeps none.
 */
export interface ExpiryPolicy {
    readonly graceMs: false | number;
}

export type ReadThroughBentoCache = BentoCache<Record<string, BentoStore>>;

/**
 * Bound by the app: the cache's settings.
 */
export const cacheConfigId = identifier<CacheConfig>();

/**
 * Bound by the app: a Valkey connection it already has (e.g. for rate limiting). The cache uses it, but
 * never closes it. Needed by a single-node topology, and by a synced memory tier for pub/sub.
 */
export const valkeyConnectionId = identifier(Redis).named('valkeyConnection');

/**
 * Bound by the app, once per node: its connections to the nodes to spread keys over, for
 * `shardedTopologyBinding`. The cache never closes them.
 */
export const valkeyShardId = identifier<ValkeyShard>().list();

/**
 * Where keys live: one node, or several.
 */
export const valkeyTopologyId = identifier<ValkeyTopology>();

/**
 * Whether each instance keeps copies in memory, and whether they are kept in sync.
 */
export const memoryTierId = identifier<MemoryTier>();

/**
 * Whether expired values are served while refreshing.
 */
export const expiryPolicyId = identifier<ExpiryPolicy>();

/**
 * The tier every instance shares, in Valkey, and how a miss is loaded: BentoCache's own tier (one load per
 * instance), or lease-cache (one load across instances, and safe from loads finishing after an invalidation).
 */
export const sharedTierId = identifier<SharedTier>();

/**
 * BentoCache, assembled from the features above.
 */
export const bentoCacheId = identifier<ReadThroughBentoCache>();
