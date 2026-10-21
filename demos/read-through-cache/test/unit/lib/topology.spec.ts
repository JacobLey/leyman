import type { ValkeyNode } from '@leyman/demo-read-through-cache';
import { ResizableValkeyTopology } from '@leyman/demo-read-through-cache';
import { expect } from '@leyman/expect';
import { beforeEach, suite, test } from 'mocha-chain';
import { valkeyNodes, valkeyUrl } from '../../helpers/valkey.js';

/**
 * @param nodes - Nodes to change
 * @param name - Node to drain, or to add at size 0
 * @returns The nodes, with that one at size 0
 */
const atZero = (nodes: readonly ValkeyNode[], name: string): ValkeyNode[] =>
    nodes.map(node => (node.name === name ? { ...node, size: 0 } : node));

const keys = Array.from({ length: 100 }, (_, i) => `key-${i}`);

/**
 * Name of the node holding a key.
 *
 * @param topology - Topology placing the key
 * @param key - Cache key
 * @returns Node name
 */
const nameFor = (topology: ResizableValkeyTopology, key: string): string | undefined =>
    topology.shards.find(shard => shard.connection === topology.connectionFor(key))?.name;

suite('ResizableValkeyTopology', () => {
    test('Rejects nodes with repeated names', () => {
        expect(
            () =>
                new ResizableValkeyTopology([
                    { name: 'a', size: 1, url: valkeyUrl(1) },
                    { name: 'a', size: 1, url: valkeyUrl(2) },
                ])
        ).to.throw(RangeError);
    });

    const withTopology = beforeEach(() => ({
        topology: new ResizableValkeyTopology(valkeyNodes(3)),
    }));

    withTopology.afterEach(async ({ topology }) => {
        await topology.close();
    });

    withTopology.test('Spreads keys over every node', ({ topology }) => {
        const used = new Set(keys.map(key => nameFor(topology, key)));

        expect(used).to.deep.equal(new Set(['node-1', 'node-2', 'node-3']));
    });

    withTopology.test('Connects to every node', async ({ topology }) => {
        const pongs = await Promise.all(
            topology.shards.map(async shard => shard.connection.ping())
        );

        expect(pongs).to.deep.equal(['PONG', 'PONG', 'PONG']);
    });

    withTopology.test("Invalidates on the key's node by default", ({ topology }) => {
        expect(topology.invalidationConnections('key')).to.deep.equal([
            topology.connectionFor('key'),
        ]);
    });

    suite('With invalidateEveryNode', () => {
        const withEvery = beforeEach(() => ({
            everywhere: new ResizableValkeyTopology(valkeyNodes(3), { invalidateEveryNode: true }),
        }));
        withEvery.afterEach(async ({ everywhere }) => {
            await everywhere.close();
        });

        withEvery.test('Invalidates on every node', ({ everywhere }) => {
            expect(everywhere.invalidationConnections('key')).to.deep.equal(everywhere.connections);
        });

        withEvery.test('Keeps invalidating on every node once resized', async ({ everywhere }) => {
            await everywhere.resize(atZero(valkeyNodes(4), 'node-4'));

            expect(everywhere.invalidationConnections('key')).to.have.length(4);
        });

        withEvery.test('Adds a node at size 0, then sizes it', async ({ everywhere }) => {
            await everywhere.resize(atZero(valkeyNodes(4), 'node-4'));
            await everywhere.resize(valkeyNodes(4));

            expect(everywhere.shards.map(({ size }) => size)).to.deep.equal([1, 1, 1, 1]);
        });

        withEvery.test(
            'Refuses to add a node with a size, leaving the nodes unchanged',
            async ({ everywhere }) => {
                const before = everywhere.shards;

                await expect(everywhere.resize(valkeyNodes(4))).to.be.rejectedWith(
                    RangeError,
                    'Node "node-4" must join at size 0'
                );
                expect(everywhere.shards).to.equal(before);
            }
        );

        withEvery.test('Drains a node to size 0, then removes it', async ({ everywhere }) => {
            await everywhere.resize(atZero(valkeyNodes(3), 'node-3'));
            await everywhere.resize(valkeyNodes(2));

            expect(everywhere.shards.map(({ name }) => name)).to.deep.equal(['node-1', 'node-2']);
        });

        withEvery.test('Refuses to remove a node before it is drained', async ({ everywhere }) => {
            await expect(everywhere.resize(valkeyNodes(2))).to.be.rejectedWith(
                RangeError,
                'Node "node-3" must be drained to size 0 before it leaves'
            );
        });

        withEvery.test(
            'Refuses to move a node of some size to another URL',
            async ({ everywhere }) => {
                const [, ...rest] = valkeyNodes(3);

                await expect(
                    everywhere.resize([{ name: 'node-1', size: 1, url: valkeyUrl(9) }, ...rest])
                ).to.be.rejectedWith(RangeError, 'Node "node-1" must join at size 0');
            }
        );
    });

    suite('resize', () => {
        withTopology.test('Keeps the connections of unchanged nodes', async ({ topology }) => {
            const [first] = topology.shards;

            await topology.resize(valkeyNodes(4));

            expect(topology.shards[0]?.connection).to.equal(first?.connection);
        });

        withTopology.test('Closes the connections of removed nodes', async ({ topology }) => {
            const removed = topology.shards.at(-1);

            await topology.resize(valkeyNodes(2));

            await expect(removed!.connection.ping()).to.be.rejected;
        });

        withTopology.test('Reconnects a node whose URL changed', async ({ topology }) => {
            const [first] = topology.shards;

            await topology.resize([{ name: 'node-1', size: 1, url: valkeyUrl(9) }]);

            await expect(first!.connection.ping()).to.be.rejected;
            expect(topology.shards[0]?.connection.options.db).to.equal(9);
        });

        withTopology.test('Only moves keys to an added node', async ({ topology }) => {
            const before = new Map(keys.map(key => [key, nameFor(topology, key)]));

            await topology.resize(valkeyNodes(4));

            const moved = keys.filter(key => nameFor(topology, key) !== before.get(key));
            expect(new Set(moved.map(key => nameFor(topology, key)))).to.deep.equal(
                new Set(['node-4'])
            );
        });

        withTopology.test('Drains a node of size 0, keeping it connected', async ({ topology }) => {
            await topology.resize(
                valkeyNodes(3).map(node => ({ ...node, size: node.name === 'node-3' ? 0 : 1 }))
            );

            expect(keys.map(key => nameFor(topology, key))).to.not.include('node-3');
            expect(topology.shards.map(shard => shard.name)).to.include('node-3');
        });

        withTopology.test(
            'Leaves the nodes unchanged when the new ones are invalid',
            async ({ topology }) => {
                const before = topology.shards;

                await expect(topology.resize([])).to.be.rejectedWith(RangeError);

                expect(topology.shards).to.equal(before);
            }
        );
    });

    test('Closes every connection when disposed', async () => {
        const topology = new ResizableValkeyTopology(valkeyNodes(2));

        await topology[Symbol.asyncDispose]();

        await Promise.all(
            topology.connections.map(async connection => {
                await expect(connection.ping()).to.be.rejected;
            })
        );
    });

    test('Closes every connection', async () => {
        const topology = new ResizableValkeyTopology(valkeyNodes(2));

        await topology.close();

        await Promise.all(
            topology.shards.map(async shard => {
                await expect(shard.connection.ping()).to.be.rejected;
            })
        );
    });
});
