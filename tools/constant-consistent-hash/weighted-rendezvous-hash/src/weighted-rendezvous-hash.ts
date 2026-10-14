import { hashKey } from 'constant-consistent-hash';
import { draw, score } from './lib/score.js';

const SEED_BITS = 32;
const MAX_SEED = 2 ** SEED_BITS - 1;

/**
 * A node keys can be assigned to.
 */
export interface WeightedNode {
    /**
     * Identifies the node: keys follow names, not positions in the input.
     * Must be unique.
     */
    readonly name: string;
    /**
     * Non-negative safe integer. Only proportions matter: sizes of 1, 2 and 3 assign keys the same as 100, 200 and 300.
     * A node of size 0 receives no keys, the same as leaving it out.
     */
    readonly size: number;
}

/**
 * Options for {@link createRendezvousHash}.
 */
export interface RendezvousHashOptions {
    /**
     * Unsigned 32 bit integer that selects an independent hash function.
     *
     * @default 0
     */
    readonly seed?: number;
}

/**
 * Assigns keys to weighted nodes, built by {@link createRendezvousHash}.
 *
 * @template Node - type of the nodes given, returned by `get`
 */
export interface RendezvousHash<Node extends WeightedNode> {
    /**
     * Node a key is assigned to.
     *
     * @param key - value to be hashed (as UTF-8)
     * @returns one of the nodes with a positive size, the same object that was given
     */
    get: (key: string) => Node;
    /**
     * Nodes with a positive size, sorted by name.
     */
    readonly nodes: readonly Node[];
    /**
     * Fraction of keys assigned to a node: its size / total size.
     *
     * @param name - node name
     * @returns fraction between 0 and 1, 0 for an unknown node
     */
    share: (name: string) => number;
    /**
     * Expected fraction of keys that `next` assigns to a different node.
     *
     * @param next - hash to compare with
     * @returns fraction between 0 and 1
     */
    moved: (next: RendezvousHash<WeightedNode>) => number;
    /**
     * Builds the hash for a new set of nodes, with the same options.
     *
     * @param nodes - nodes to assign keys to
     * @returns the same as {@link createRendezvousHash} with these nodes
     */
    update: <Next extends WeightedNode>(nodes: Iterable<Next>) => RendezvousHash<Next>;
}

/**
 * Nodes of one size. Within them the highest draw wins, so only one score is computed per size.
 *
 * @template Node - type of the nodes given
 */
interface SizeClass<Node extends WeightedNode> {
    readonly size: number;
    readonly nodes: readonly Node[];
    /**
     * Low and high word of each node name's hash, in pairs.
     */
    readonly hashes: Uint32Array;
}

/**
 * Internal details of a hash, for `moved` to compare.
 */
interface Details {
    readonly seed: number;
    readonly sizes: ReadonlyMap<string, number>;
}

const details = new WeakMap<RendezvousHash<WeightedNode>, Details>();

/**
 * Validates nodes, and sorts the ones with a positive size by name.
 *
 * @param nodes - nodes as given
 * @returns nodes with a positive size, sorted by name
 * @throws {RangeError} when a name is repeated, a size is invalid, or no node has a positive size
 */
const normalizeNodes = <Node extends WeightedNode>(nodes: Iterable<Node>): readonly Node[] => {
    const names = new Set<string>();
    const sized: Node[] = [];
    for (const node of nodes) {
        if (names.has(node.name)) {
            throw new RangeError(`node names must be unique, received ${node.name} twice`);
        }
        names.add(node.name);
        // eslint-disable-next-line unicorn/no-impossible-length-comparison -- `size` is a weight, not a collection size
        if (!Number.isSafeInteger(node.size) || node.size < 0) {
            throw new RangeError(
                `node size must be a non-negative integer, received ${node.size} for ${node.name}`
            );
        }
        if (node.size > 0) {
            sized.push(node);
        }
    }
    if (sized.length === 0) {
        throw new RangeError('at least one node must have a positive size');
    }
    // eslint-disable-next-line unicorn/prefer-simple-sort-comparator -- Names are strings, which do not subtract
    return sized.toSorted((a, b) => (a.name < b.name ? -1 : 1));
};

/**
 * Total of every node's size.
 *
 * @param sizes - positive sizes by name
 * @returns sum of the sizes
 */
const totalSize = (sizes: ReadonlyMap<string, number>): number =>
    sizes.values().reduce((sum, size) => sum + size, 0);

/**
 * Expected fraction of keys assigned to a different node, when sizes change from `before` to `after`.
 *
 * Weighted rendezvous with exponential scores keeps a key's node with probability
 * J = sum over nodes i of 1 / sum over nodes j of max(p_j / p_i, q_j / q_i),
 * for shares p before and q after (Moulton and Jiang, "Maximally consistent sampling and the Jaccard index
 * of probability distributions", 2018). Sorting nodes by p / q splits each inner max into a sum of p for
 * nodes at or above i, and a sum of q for nodes below, so J takes one pass over prefix sums.
 *
 * @param before - sizes by name
 * @param after - sizes by name
 * @returns fraction between 0 and 1
 */
const expectedMoved = (
    before: ReadonlyMap<string, number>,
    after: ReadonlyMap<string, number>
): number => {
    const totalBefore = totalSize(before);
    const totalAfter = totalSize(after);
    const shares = [...new Set([...before.keys(), ...after.keys()])].map(name => ({
        p: (before.get(name) ?? 0) / totalBefore,
        q: (after.get(name) ?? 0) / totalAfter,
    }));
    // Ascending p / q, compared by cross multiplication so nodes missing from one side sort to the ends
    const sorted = shares.toSorted((a, b) => a.p * b.q - b.p * a.q);

    let kept = 0;
    let qBelow = 0;
    let pAtOrAbove = 1;
    for (let start = 0; start < sorted.length; ) {
        // Nodes with equal p / q are in each other's "at or above"
        let end = start + 1;
        while (
            end < sorted.length &&
            sorted[start]!.p * sorted[end]!.q === sorted[end]!.p * sorted[start]!.q
        ) {
            end++;
        }
        const group = sorted.slice(start, end);
        for (const { p, q } of group) {
            if (p > 0 && q > 0) {
                kept += 1 / (pAtOrAbove / p + qBelow / q);
            }
        }
        for (const { p, q } of group) {
            qBelow += q;
            pAtOrAbove -= p;
        }
        start = end;
    }
    // Floating point sums can drift just past the bounds
    return Math.min(1, Math.max(0, 1 - kept));
};

/**
 * Builds a hash that assigns keys to weighted nodes, with weighted rendezvous hashing.
 *
 * Every key is assigned to a node with probability size / total size.
 * The result only depends on the set of nodes and their proportions, never their order or history,
 * so every client given the same nodes assigns keys the same way. When nodes are added, removed or resized,
 * few keys move: an added or grown node only takes keys, a removed or shrunk node only gives them up,
 * and resizing several nodes at once moves less than twice the minimum.
 *
 * @example
 * const hash = createRendezvousHash([{ name: 'a', size: 1 }, { name: 'b', size: 2 }]);
 * hash.get('00000000-0000-4000-8000-000000000000').name; // 'a'
 *
 * @param nodes - nodes to assign keys to, in any order
 * @param [options] - optional
 * @param [options.seed=0] - selects an independent hash function
 * @returns assignment of keys to the nodes
 * @throws {RangeError} when nodes or options are invalid
 */
export const createRendezvousHash = <Node extends WeightedNode>(
    nodes: Iterable<Node>,
    options?: RendezvousHashOptions
): RendezvousHash<Node> => {
    const seed = options?.seed ?? 0;
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > MAX_SEED) {
        throw new RangeError(`seed must be an integer between 0 and 2^32 - 1, received ${seed}`);
    }

    const sorted = normalizeNodes(nodes);
    const sizes: ReadonlyMap<string, number> = new Map(sorted.map(node => [node.name, node.size]));
    const total = totalSize(sizes);
    const classes: readonly SizeClass<Node>[] = [...Map.groupBy(sorted, node => node.size)].map(
        ([size, members]) => ({
            size,
            nodes: members,
            hashes: Uint32Array.from(members.flatMap(node => hashKey(node.name, { seed }))),
        })
    );

    const hash: RendezvousHash<Node> = {
        get: key => {
            const keyHash = hashKey(key, { seed });
            let best = sorted[0]!;
            let bestScore = Number.POSITIVE_INFINITY;
            for (const sizeClass of classes) {
                let classBest = 0;
                let classDraw = -1;
                const { hashes } = sizeClass;
                // Indexed, as iterating tuples of hashes made lookups ~1.5x slower
                for (let index = 0; index < hashes.length / 2; index++) {
                    const value = draw(keyHash, hashes[2 * index]!, hashes[2 * index + 1]!);
                    // Ties (practically impossible) go to the first name, as nodes are sorted
                    if (value <= classDraw) {
                        continue;
                    }
                    classBest = index;
                    classDraw = value;
                }
                const classScore = score(classDraw, sizeClass.size);
                if (classScore >= bestScore) {
                    continue;
                }
                best = sizeClass.nodes[classBest]!;
                bestScore = classScore;
            }
            return best;
        },
        nodes: sorted,
        share: name => (sizes.get(name) ?? 0) / total,
        moved: next => {
            const other = details.get(next)!;
            if (other.seed === seed) {
                return expectedMoved(sizes, other.sizes);
            }
            // Independent hash functions agree with probability sum(p * q)
            const otherTotal = totalSize(other.sizes);
            let same = 0;
            for (const [name, size] of sizes) {
                same += (size / total) * ((other.sizes.get(name) ?? 0) / otherTotal);
            }
            return 1 - same;
        },
        update: next => createRendezvousHash(next, { seed }),
    };
    details.set(hash, { seed, sizes });
    return hash;
};
