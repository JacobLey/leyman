import type { RendezvousHash, RendezvousHashOptions, WeightedNode } from 'weighted-rendezvous-hash';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { createRendezvousHash } from 'weighted-rendezvous-hash';

const keys = Array.from(
    { length: 5000 },
    (_, i) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`
);

const nodes = [
    { name: 'a', size: 1 },
    { name: 'b', size: 1 },
    { name: 'c', size: 1 },
    { name: 'd', size: 2 },
    { name: 'e', size: 3 },
] as const;

/**
 * Keys assigned to a different node by `after`, as pairs of names.
 *
 * @param before - hash before the change
 * @param after - hash after the change
 * @returns names before and after, for every key that moved
 */
const movedKeys = (
    before: RendezvousHash<WeightedNode>,
    after: RendezvousHash<WeightedNode>
): (readonly [string, string])[] =>
    keys
        .map(key => [before.get(key).name, after.get(key).name] as const)
        .filter(([from, to]) => from !== to);

suite('createRendezvousHash', () => {
    test('types', () => {
        expectTypeOf(createRendezvousHash)
            .parameter(1)
            .toEqualTypeOf<RendezvousHashOptions | undefined>();
        const hash = createRendezvousHash([{ name: 'a', size: 1, host: 'a.example.com' }]);
        expectTypeOf(hash.get('key').host).toEqualTypeOf<string>();
        expectTypeOf(
            hash.update([{ name: 'b', size: 1, port: 80 }]).get('key').port
        ).toEqualTypeOf<number>();
    });

    test('Returns the node objects given', () => {
        const hash = createRendezvousHash(nodes);
        expect(keys.every(key => nodes.includes(hash.get(key)))).to.equal(true);
    });

    test('Ignores the order of nodes', () => {
        const hash = createRendezvousHash(nodes);
        const reversed = createRendezvousHash(nodes.toReversed());
        expect(hash.moved(reversed)).to.equal(0);
        expect(reversed.nodes.map(node => node.name)).to.deep.equal(['a', 'b', 'c', 'd', 'e']);
    });

    test('Only uses proportions of sizes', () => {
        const hash = createRendezvousHash(nodes);
        const scaled = hash.update(nodes.map(node => ({ ...node, size: node.size * 1_000_000 })));
        expect(hash.moved(scaled)).to.equal(0);
    });

    test('Ignores nodes of size 0', () => {
        const hash = createRendezvousHash(nodes);
        const withEmpty = hash.update([...nodes, { name: 'f', size: 0 }]);
        expect(hash.moved(withEmpty)).to.equal(0);
        expect(withEmpty.share('f')).to.equal(0);
    });

    test('Shares follow sizes', () => {
        const hash = createRendezvousHash(nodes);
        // Sizes total 8
        expect(nodes.map(node => hash.share(node.name))).to.deep.equal([
            1 / 8,
            1 / 8,
            1 / 8,
            2 / 8,
            3 / 8,
        ]);
        expect(hash.share('unknown')).to.equal(0);
    });

    test('Keys are spread by share', () => {
        const hash = createRendezvousHash(nodes);
        for (const node of nodes) {
            const assigned = keys.filter(key => hash.get(key) === node).length / keys.length;
            expect(assigned).to.be.closeTo(hash.share(node.name), 0.02);
        }
    });

    suite('Moves keys only to or from the changed node', () => {
        test('Adding a node', () => {
            const before = createRendezvousHash(nodes);
            const after = before.update([...nodes, { name: 'bb', size: 2 }]);
            const moved = movedKeys(before, after);
            expect(moved.every(([, to]) => to === 'bb')).to.equal(true);
            expect(moved.length / keys.length).to.be.closeTo(2 / 10, 0.03);
        });

        test('Removing a node', () => {
            const before = createRendezvousHash(nodes);
            const after = before.update(nodes.filter(node => node.name !== 'c'));
            const moved = movedKeys(before, after);
            expect(moved.every(([from]) => from === 'c')).to.equal(true);
            expect(moved.length / keys.length).to.be.closeTo(before.share('c'), 0.02);
        });

        test('Growing a node', () => {
            const before = createRendezvousHash(nodes);
            const after = before.update(
                nodes.map(node => (node.name === 'a' ? { ...node, size: 3 } : node))
            );
            expect(movedKeys(before, after).every(([, to]) => to === 'a')).to.equal(true);
        });

        test('Shrinking a node', () => {
            const before = createRendezvousHash(nodes);
            const after = before.update(
                nodes.map(node => (node.name === 'e' ? { ...node, size: 1 } : node))
            );
            expect(movedKeys(before, after).every(([from]) => from === 'e')).to.equal(true);
        });
    });

    test('Resizing several nodes moves less than twice the minimum', () => {
        const before = createRendezvousHash([
            { name: 'a', size: 1 },
            { name: 'b', size: 1 },
            { name: 'c', size: 1 },
        ]);
        const after = before.update([
            { name: 'a', size: 1 },
            { name: 'b', size: 2 },
            { name: 'c', size: 3 },
        ]);
        // Shares go from 1/3 each to 1/6, 1/3 and 1/2, so at least 1/6 of keys must move.
        // Rendezvous keeps 1/6 + 2/7 + 1/3 of keys (see expectedMoved), so moves 3/14
        expect(before.moved(after)).to.be.closeTo(3 / 14, 1e-12);
        expect(movedKeys(before, after).length / keys.length).to.be.closeTo(3 / 14, 0.02);
    });

    suite('moved is the expected fraction of keys that move', () => {
        const changes = {
            'Adding a node': [...nodes, { name: 'bb', size: 2 }],
            'Removing a node': nodes.filter(node => node.name !== 'd'),
            'Resizing every node': nodes.map((node, i) => ({ ...node, size: 5 - i })),
            'Replacing every node': [{ name: 'x', size: 1 }],
        };
        for (const [change, next] of Object.entries(changes)) {
            test(change, () => {
                const before = createRendezvousHash(nodes);
                const after = before.update(next);
                expect(movedKeys(before, after).length / keys.length).to.be.closeTo(
                    before.moved(after),
                    0.02
                );
            });
        }

        test('Nothing moves without a change', () => {
            const hash = createRendezvousHash(nodes);
            expect(hash.moved(hash)).to.equal(0);
        });

        test('Between seeds', () => {
            const hash = createRendezvousHash(nodes);
            // Independent assignments agree with probability sum(share^2) = 16/64
            expect(hash.moved(createRendezvousHash(nodes, { seed: 1 }))).to.be.closeTo(
                48 / 64,
                1e-12
            );
            // No node in common, so every key moves
            expect(
                hash.moved(createRendezvousHash([{ name: 'x', size: 1 }], { seed: 1 }))
            ).to.equal(1);
        });
    });

    test('Seed selects an independent hash', () => {
        const hash = createRendezvousHash(nodes);
        const seeded = createRendezvousHash(nodes, { seed: 1 });
        const same = keys.filter(key => hash.get(key) === seeded.get(key)).length / keys.length;
        // Two independent assignments agree with probability sum(share^2) = 16/64
        expect(same).to.be.closeTo(16 / 64, 0.03);
    });

    suite('Invalid input', () => {
        test('Names must be unique', () => {
            expect(() =>
                createRendezvousHash([
                    { name: 'a', size: 1 },
                    { name: 'a', size: 2 },
                ])
            ).to.throw(RangeError);
        });

        test('Sizes must be non-negative integers', () => {
            for (const size of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
                expect(() => createRendezvousHash([{ name: 'a', size }])).to.throw(RangeError);
            }
        });

        test('At least one node must have a positive size', () => {
            expect(() => createRendezvousHash([])).to.throw(RangeError);
            expect(() => createRendezvousHash([{ name: 'a', size: 0 }])).to.throw(RangeError);
        });

        test('Options must be in bounds', () => {
            for (const invalid of [{ seed: -1 }, { seed: 2 ** 32 }, { seed: 1.5 }]) {
                expect(() => createRendezvousHash(nodes, invalid)).to.throw(RangeError);
            }
        });
    });
});
