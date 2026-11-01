import { createHashWorker } from '@leyman/demo-blake3-wasm';
import { loaders } from './hashes.js';
import { hotSizes, makeBytes, measureCold, measureHot, measureWorker } from './measure.js';

declare global {
    var bench: typeof benchApi;
}

const benchApi = {
    cold: async (name: keyof typeof loaders, size: number) =>
        measureCold(loaders[name], makeBytes(size)),
    hot: async () =>
        measureHot(
            {
                noble: await loaders.noble(),
                tight: await loaders.tight(),
                wasm: await loaders.wasm(),
            },
            hotSizes
        ),
    worker: async () =>
        measureWorker(
            createHashWorker,
            async (worker, bytes, transfer) => worker.hash(bytes, { transfer }),
            makeBytes(16_777_216)
        ),
};

// eslint-disable-next-line unicorn/no-global-object-property-assignment -- Called from the bench's runner
globalThis.bench = benchApi;
