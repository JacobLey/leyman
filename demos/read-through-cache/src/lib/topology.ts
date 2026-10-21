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
    /**
     * @param key - Cache key, without prefix
     * @returns Connections to the nodes an invalidation of the key goes to: the key's node, or every node
     */
    readonly invalidationConnections: (key: string) => readonly Redis[];
}

export interface TopologyOptions {
    /**
     * Invalidate a key on every node, rather than only on the node holding it, at one round trip per node.
     *
     * Instances don't change their node lists at the same moment, so while a change rolls out, two instances can
     * place a key on different nodes, and an invalidation from one misses the copy the other reads. Invalidating
     * on every node reaches both copies, as long as each node joins and leaves at size `0`: added at `0` until
     * every instance has it, then sized, and drained to `0` for the longest TTL before it is removed.
     */
    readonly invalidateEveryNode?: boolean;
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
 * @param options - Where invalidations go
 * @returns Topology over the shards
 * @throws {RangeError} When names repeat, or no shard has a positive size
 */
export const rendezvousTopology = (
    shards: readonly ValkeyShard[],
    options: TopologyOptions = {}
): ValkeyTopology => {
    const hash: RendezvousHash<ValkeyShard> = createRendezvousHash(shards);
    const connections = shards.map(shard => shard.connection);
    const connectionFor = (key: string): Redis => hash.get(key).connection;
    return {
        connectionFor,
        connections,
        invalidationConnections: options.invalidateEveryNode
            ? () => connections
            : key => [connectionFor(key)],
    };
};

interface ResizableShard extends ValkeyShard {
    readonly url: string;
}

const connect = (node: ValkeyNode): ResizableShard => ({
    ...node,
    // Fail fast rather than queueing commands for a node that is down. Reads of its keys then fail too, unless
    // BentoCache has a memory tier, or lease-cache has a fallback (see the README's "When Valkey is down").
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
    readonly #options: TopologyOptions;
    #shards: readonly ResizableShard[];
    #topology: ValkeyTopology;

    /**
     * @param nodes - Nodes to spread keys over, with unique names
     * @param options - Where invalidations go. Add and remove nodes at size `0` (see `invalidateEveryNode`).
     * @throws {RangeError} When names repeat, or no node has a positive size
     */
    public constructor(nodes: readonly ValkeyNode[], options: TopologyOptions = {}) {
        // Validate before connecting, so invalid nodes don't leave connections open
        createRendezvousHash(nodes);
        this.#options = options;
        this.#shards = nodes.map(node => connect(node));
        this.#topology = rendezvousTopology(this.#shards, options);
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

    public readonly invalidationConnections = (key: string): readonly Redis[] =>
        this.#topology.invalidationConnections(key);

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
        this.#topology = rendezvousTopology(shards, this.#options);
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
            invalidationConnections: () => [connection],
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
