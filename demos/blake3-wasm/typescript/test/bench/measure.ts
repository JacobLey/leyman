/**
 * Sizes to measure, in bytes. 3 and 4 KiB either side of the step where the WebAssembly build starts using SIMD.
 */
export const hotSizes = [64, 256, 1024, 3072, 4096, 16_384, 65_536, 1_048_576, 16_777_216];
export const coldSizes = [64, 1024, 4096, 16_384, 65_536, 1_048_576, 16_777_216];

/**
 * Bytes to hash, the same in every environment.
 *
 * @param size - length
 * @returns bytes that repeat every 251
 */
export const makeBytes = (size: number): Uint8Array<ArrayBuffer> =>
    Uint8Array.from({ length: size }, (_, i) => i % 251);

type Hash = (bytes: Uint8Array<ArrayBuffer>) => unknown;

const median = (values: readonly number[]): number =>
    values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]!;

// Long enough that a browser's coarse clock doesn't matter, short enough that the whole bench takes under a minute
const BATCH_MILLISECONDS = 20;
const ROUNDS = 8;
const DISCARDED_ROUNDS = 3;

/**
 * Time per call of each hash at each size, once warm. Every hash runs every size in turn, across rounds, as one size
 * repeated alone is the best case for a JIT, and the first rounds are dropped as warm up.
 *
 * @param hashes - by name
 * @param sizes - bytes
 * @returns milliseconds per call, by name then size
 */
export const measureHot = (
    hashes: Readonly<Record<string, Hash>>,
    sizes: readonly number[]
): Record<string, Record<number, number>> => {
    const inputs = sizes.map(size => [size, makeBytes(size)] as const);
    const samples = new Map<string, number[]>();
    for (let round = 0; round < ROUNDS; round++) {
        for (const [size, bytes] of inputs) {
            for (const [name, hash] of Object.entries(hashes)) {
                let calls = 0;
                const start = performance.now();
                let elapsed: number;
                do {
                    hash(bytes);
                    calls++;
                    elapsed = performance.now() - start;
                } while (elapsed < BATCH_MILLISECONDS);
                if (round < DISCARDED_ROUNDS) {
                    continue;
                }
                const key = `${name}:${size}`;
                samples.set(key, [...(samples.get(key) ?? []), elapsed / calls]);
            }
        }
    }
    return Object.fromEntries(
        Object.keys(hashes).map(name => [
            name,
            Object.fromEntries(sizes.map(size => [size, median(samples.get(`${name}:${size}`)!)])),
        ])
    );
};

/**
 * The cost of a worker, apart from hashing: the time to start one, and a call's round trip with nothing to hash.
 *
 * @param start - starts a worker
 * @param call - hashes in the worker
 * @param bytes - a large input
 * @returns milliseconds
 */
export const measureWorker = async <Worker extends AsyncDisposable>(
    start: () => Worker,
    call: (
        worker: Worker,
        bytes: Uint8Array<ArrayBuffer>,
        shouldTransfer: boolean
    ) => Promise<unknown>,
    bytes: Uint8Array<ArrayBuffer>
): Promise<Record<'copied' | 'empty' | 'startup' | 'transferred', number>> => {
    const startups: number[] = [];
    const empty = makeBytes(0);
    for (let i = 0; i < 5; i++) {
        const before = performance.now();
        await using worker = start();
        await call(worker, empty, false);
        startups.push(performance.now() - before);
    }
    await using worker = start();
    const time = async (
        runs: number,
        input: () => Uint8Array<ArrayBuffer>,
        shouldTransfer: boolean
    ) => {
        const samples: number[] = [];
        for (let i = 0; i < runs; i++) {
            const prepared = input();
            const before = performance.now();
            await call(worker, prepared, shouldTransfer);
            samples.push(performance.now() - before);
        }
        return median(samples);
    };
    return {
        startup: median(startups),
        empty: await time(200, () => empty, false),
        copied: await time(9, () => bytes, false),
        transferred: await time(9, () => new Uint8Array(bytes), true),
    };
};

/**
 * The cost from nothing loaded to a first result: for a process or page that does this once.
 *
 * @param load - loads a hash
 * @param bytes - to hash once
 * @returns milliseconds to load, and for the first call
 */
export const measureCold = async (
    load: () => Promise<Hash>,
    bytes: Uint8Array<ArrayBuffer>
): Promise<{ load: number; first: number }> => {
    const start = performance.now();
    const hash = await load();
    const loaded = performance.now();
    hash(bytes);
    return { load: loaded - start, first: performance.now() - loaded };
};

export { median };
