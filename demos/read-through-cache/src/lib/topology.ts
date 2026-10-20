import type { RendezvousHash } from 'weighted-rendezvous-hash';
import { Redis } from 'ioredis';
import { bind, singletonScope } from 'haywire';
import { createRendezvousHash } from 'weighted-rendezvous-hash';
import { valkeyConnectionId, valkeyShardId, valkeyTopologyId } from './ids.js';

/**
 * Which Valkey connection holds each key.
 */
export interface ValkeyTopology {
    /**
     * @param key - Cache key, without prefix
     * @returns Connection to the node holding the key
     */
    readonly connectionFor: (key: string) => Redis;
    /**
     * Every node's connection, e.g. to clear a prefix everywhere.
     */
    readonly connections: readonly Redis[];
}

/**
 * A Valkey (or Redis) server holding a share of the keys, on the app's connection.
 */
export interface ValkeyShard {
    /**
     * Identifies the node to the hash. Keys only move between nodes when names are added, removed or resized.
     */
    readonly name: string;
    /**
     * Relative share of keys, e.g. by memory. `0` drains the node.
     */
    readonly size: number;
    readonly connection: Redis;
}

/**
 * A node for `ResizableValkeyTopology`, which opens the connection itself.
 */
export interface ValkeyNode {
    readonly name: string;
    readonly size: number;
    /**
     * Connection URL, e.g. `redis://valkey-1:6379/0`.
     */
    readonly url: string;
}

/**
 * Places keys over shards with weighted rendezvous hashing, so any node can be added, removed or resized, and
 * only the keys that must move do. Each client computes the same placement from the node list alone: there is no
 * ring to build or share.
 *
 * @param shards - Nodes with their connections, with unique names
 * @returns Topology over the shards
 * @throws {RangeError} When names repeat, or no shard has a positive size
 */
export const rendezvousTopology = (shards: readonly ValkeyShard[]): ValkeyTopology => {
    const hash: RendezvousHash<ValkeyShard> = createRendezvousHash(shards);
    return {
        connectionFor: key => hash.get(key).connection,
        connections: shards.map(shard => shard.connection),
    };
};

interface ResizableShard extends ValkeyShard {
    readonly url: string;
}

const connect = (node: ValkeyNode): ResizableShard => ({
    ...node,
    // Fail fast rather than queueing commands for a node that is down: the cache is an optimization,
    // and BentoCache falls back to the loader (or a stale value) when Valkey errors.
    connection: new Redis(node.url, { maxRetriesPerRequest: 1 }),
});

/**
 * Keys spread over Valkey nodes that can change while the app runs. It opens (and owns) a connection to
 * each node: `close()`, or disposing it, closes them.
 *
 * A container can't rebuild a binding, so the app creates this itself, binds it with
 * `bind(valkeyTopologyId).withInstance(topology)`, and calls `resize()` when the nodes change.
 */
export class ResizableValkeyTopology implements ValkeyTopology, AsyncDisposable {
    #shards: readonly ResizableShard[];
    #topology: ValkeyTopology;

    /**
     * @param nodes - Nodes to spread keys over, with unique names
     * @throws {RangeError} When names repeat, or no node has a positive size
     */
    public constructor(nodes: readonly ValkeyNode[]) {
        // Validate before connecting, so invalid nodes don't leave connections open
        createRendezvousHash(nodes);
        this.#shards = nodes.map(node => connect(node));
        this.#topology = rendezvousTopology(this.#shards);
    }

    /**
     * Every node, including drained ones (size `0`) that still have a connection.
     *
     * @returns Every node, in the order given
     */
    public get shards(): readonly ValkeyShard[] {
        return this.#shards;
    }

    public get connections(): readonly Redis[] {
        return this.#topology.connections;
    }

    public readonly connectionFor = (key: string): Redis => this.#topology.connectionFor(key);

    /**
     * Change the nodes. Connections to nodes that keep their name and URL are reused, and connections to removed
     * nodes are closed.
     *
     * Keys that move are misses on their new node (loaded again), and are left to expire on their old one.
     *
     * @param nodes - New nodes, as for the constructor
     * @throws {RangeError} When names repeat, or no node has a positive size. The topology is left unchanged.
     */
    public async resize(nodes: readonly ValkeyNode[]): Promise<void> {
        createRendezvousHash(nodes);
        const existing = new Map(this.#shards.map(shard => [shard.name, shard]));
        const shards = nodes.map(node => {
            const shard = existing.get(node.name);
            if (shard?.url === node.url) {
                existing.delete(node.name);
                return { ...shard, size: node.size };
            }
            return connect(node);
        });
        this.#topology = rendezvousTopology(shards);
        this.#shards = shards;
        await Promise.all(existing.values().map(async shard => shard.connection.quit()));
    }

    /**
     * Close every connection.
     */
    public async close(): Promise<void> {
        await Promise.all(this.#shards.map(async shard => shard.connection.quit()));
    }

    public async [Symbol.asyncDispose](): Promise<void> {
        await this.close();
    }
}

/**
 * Every key on the app's connection (`valkeyConnectionId`).
 */
export const singleNodeTopologyBinding = bind(valkeyTopologyId)
    .withDependencies([valkeyConnectionId])
    .withProvider(
        (connection): ValkeyTopology => ({
            connectionFor: () => connection,
            connections: [connection],
        })
    )
    .scoped(singletonScope);

/**
 * Keys spread over the app's shards: one `valkeyShardId` binding per node.
 */
export const shardedTopologyBinding = bind(valkeyTopologyId)
    .withDependencies([valkeyShardId])
    .withProvider(shards => rendezvousTopology(shards))
    .scoped(singletonScope);
