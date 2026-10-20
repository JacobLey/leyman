import type { Binding } from 'haywire';
import { memoryDriver } from 'bentocache/drivers/memory';
import { redisBusDriver } from 'bentocache/drivers/redis';
import { bind } from 'haywire';
import { memoryTierId, valkeyConnectionId } from './ids.js';

export interface MemoryTierOptions {
    /**
     * Most entries each instance keeps in memory, least recently used dropped first.
     */
    readonly maxItems: number;
}

/**
 * Every read goes to Valkey.
 */
export const noMemoryTierBinding = bind(memoryTierId).withInstance(store => store);

/**
 * Each instance keeps copies in memory, in front of Valkey. When a key changes, other instances keep serving
 * their copy until it expires.
 *
 * @param options - Size of the memory tier
 * @returns Binding for `memoryTierId`
 */
export const memoryTierBinding = (
    options: MemoryTierOptions
): Binding<typeof memoryTierId, [], false> =>
    bind(memoryTierId).withInstance(store => store.useL1Layer(memoryDriver(options)));

/**
 * Each instance keeps copies in memory, and drops them when the key is written, expired or invalidated by any
 * instance, through Valkey pub/sub on the app's connection.
 *
 * @param options - Size of the memory tier
 * @returns Binding for `memoryTierId`
 */
export const syncedMemoryTierBinding = (
    options: MemoryTierOptions
): Binding<typeof memoryTierId, [typeof valkeyConnectionId], false> =>
    bind(memoryTierId)
        .withDependencies([valkeyConnectionId])
        .withProvider(
            connection => store =>
                store
                    .useL1Layer(memoryDriver(options))
                    // The bus subscribes on duplicates of the connection, which it closes when the cache disconnects.
                    // The connection itself is left as it was.
                    .useBus(redisBusDriver({ connection }))
        );
