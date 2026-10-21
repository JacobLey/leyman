import type { ValkeyNode } from '@leyman/demo-read-through-cache';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { Redis } from 'ioredis';

/**
 * The devcontainer runs Valkey as a sidecar under this hostname, and Dagger binds its service under the same one.
 */
const host = 'redis://valkey:6379';

/**
 * Logical database `db` of the one Valkey server. Several databases stand in for several servers: they never
 * share keys, which is all sharding needs. Database 0 is left for pub/sub, which ignores databases.
 *
 * @param db - Database index
 * @returns Connection URL
 */
export const valkeyUrl = (db: number): string => `${host}/${db}`;

/**
 * `count` equally sized nodes, each its own database.
 *
 * @param count - Number of nodes
 * @returns Nodes named `node-1` to `node-<count>`
 */
export const valkeyNodes = (count: number): ValkeyNode[] =>
    Array.from({ length: count }, (_, i) => ({
        name: `node-${i + 1}`,
        size: 1,
        url: valkeyUrl(i + 1),
    }));

/**
 * Tests share one server (and with `--watch`, earlier runs of themselves), so each uses its own prefix rather
 * than clearing the server.
 *
 * @returns Prefix no other test uses
 */
export const uniquePrefix = (): string => `test-${randomUUID()}`;

/**
 * Waits until `count` connections subscribe to a channel. BentoCache subscribes in the background, so an
 * instance may miss a message published right after it starts.
 *
 * @param channel - Pub/sub channel
 * @param count - Number of subscribers to wait for
 */
export const waitForSubscribers = async (channel: string, count: number): Promise<void> => {
    const connection = new Redis(valkeyUrl(0));
    try {
        for (;;) {
            const [, subscribers] = (await connection.pubsub('NUMSUB', channel)) as [
                string,
                number,
            ];
            if (subscribers >= count) {
                return;
            }
            await setTimeout(5);
        }
    } finally {
        await connection.quit();
    }
};

/**
 * A connection to a server that isn't there, failing every command at once, as when Valkey is down.
 *
 * @returns Connection, never connected
 */
export const unreachableValkey = (): Redis => {
    const connection = new Redis({
        host: '127.0.0.1',
        port: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
    });
    // Each failed attempt to connect is also reported as an error event, which would crash the process unhandled
    connection.on('error', () => {});
    return connection;
};
