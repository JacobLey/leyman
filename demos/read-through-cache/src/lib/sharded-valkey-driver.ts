import type { L2CacheDriver } from 'bentocache/types';
import type { Redis } from 'ioredis';
import type { ValkeyTopology } from './topology.js';
import { RedisDriver } from 'bentocache/drivers/redis';

/**
 * BentoCache's distributed (L2) tier, spread over several Valkey nodes.
 *
 * BentoCache's own Redis driver talks to one server (or a Redis Cluster, which places keys by hash slot and
 * needs every node to run in cluster mode). This driver places keys on independent servers instead, choosing the
 * server from the topology (one, or several placed by consistent hash). Each operation is delegated to BentoCache's Redis driver for that
 * server, so values are stored exactly as BentoCache would store them on one.
 */
export class ShardedValkeyDriver implements L2CacheDriver {
    public readonly type = 'l2';
    readonly #topology: ValkeyTopology;
    readonly #prefix: string;
    /**
     * One Redis driver per connection, which only holds the connection and the prefix.
     * Keyed weakly, so drivers for connections closed by a resize are dropped with them.
     */
    readonly #drivers = new WeakMap<Redis, RedisDriver>();

    /**
     * @param topology - Nodes to spread keys over, shared with any namespaces of this driver
     * @param prefix - Prefix of every key. BentoCache passes its `prefix` option here.
     */
    public constructor(topology: ValkeyTopology, prefix: string) {
        this.#topology = topology;
        this.#prefix = prefix;
    }

    /**
     * Same nodes, under a nested prefix. A key is placed by its own name, whatever the namespace, so every
     * namespace spreads over the nodes the same way.
     *
     * @param namespace - Appended to the prefix
     * @returns Driver for the namespace
     */
    public namespace(namespace: string): ShardedValkeyDriver {
        return new ShardedValkeyDriver(this.#topology, `${this.#prefix}:${namespace}`);
    }

    public async get(key: string): Promise<string | undefined> {
        return this.#driverForKey(key).get(key);
    }

    public async pull(key: string): Promise<string | undefined> {
        return this.#driverForKey(key).pull(key);
    }

    public async set(key: string, value: string, ttl?: number): Promise<boolean> {
        return this.#driverForKey(key).set(key, value, ttl);
    }

    /**
     * Deletes the key from each node the topology sends its invalidations to.
     *
     * @param key - Key to delete
     * @returns Whether any node had it
     */
    public async delete(key: string): Promise<boolean> {
        const deleted = await Promise.all(
            this.#topology
                .invalidationConnections(key)
                .map(async connection => this.#driverFor(connection).delete(key))
        );
        return deleted.includes(true);
    }

    /**
     * One round trip per node, rather than per key.
     *
     * @param keys - Keys to delete, from each node the topology sends their invalidations to
     * @returns Always `true`, like BentoCache's Redis driver
     */
    public async deleteMany(keys: string[]): Promise<boolean> {
        const byConnection = Map.groupBy(
            keys.flatMap(key =>
                this.#topology.invalidationConnections(key).map(connection => ({ connection, key }))
            ),
            ({ connection }) => connection
        );
        await Promise.all(
            byConnection
                .entries()
                .map(async ([connection, entries]) =>
                    this.#driverFor(connection).deleteMany(entries.map(({ key }) => key))
                )
        );
        return true;
    }

    /**
     * Deletes the key from the nodes the topology sends its invalidations to, other than the key's own: with
     * `invalidateEveryNode`, copies another instance's node list put elsewhere.
     *
     * @param key - Key to delete
     */
    public async deleteElsewhere(key: string): Promise<void> {
        const own = this.#topology.connectionFor(key);
        await Promise.all(
            this.#topology
                .invalidationConnections(key)
                .filter(connection => connection !== own)
                .map(async connection => this.#driverFor(connection).delete(key))
        );
    }

    /**
     * Clears the prefix on every node, including drained ones, which may still hold keys from before a resize.
     */
    public async clear(): Promise<void> {
        await Promise.all(
            this.#topology.connections.map(async connection => this.#driverFor(connection).clear())
        );
    }

    /**
     * Leaves the connections open: they belong to whoever made the topology (the app, or the container
     * that disposes it), and may be shared with other caches or uses.
     */
    public async disconnect(): Promise<void> {}

    #driverForKey(key: string): RedisDriver {
        return this.#driverFor(this.#topology.connectionFor(key));
    }

    #driverFor(connection: Redis): RedisDriver {
        let driver = this.#drivers.get(connection);
        if (!driver) {
            driver = new RedisDriver({ connection, prefix: this.#prefix });
            this.#drivers.set(connection, driver);
        }
        return driver;
    }
}
