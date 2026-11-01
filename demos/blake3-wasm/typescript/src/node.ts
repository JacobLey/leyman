import type { HashWorker } from './lib/hash-worker.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import nodeEndpoint from 'comlink/dist/esm/node-adapter.mjs';
import { initSync } from '@leyman/demo-blake3-wasm-rust';
import { wrapHashWorker } from './lib/hash-worker.js';

export type { HashOptions, HashWorker } from './lib/hash-worker.js';
export { hash } from '@leyman/demo-blake3-wasm-rust';

const wasmPath = fileURLToPath(import.meta.resolve('@leyman/demo-blake3-wasm-rust/wasm'));

initSync({ module: readFileSync(wasmPath) });

/**
 * Starts a worker thread that hashes, so that a large input doesn't block the event loop.
 *
 * @returns the worker, to close when done with it: it keeps the process running until then
 */
export const createHashWorker = (): HashWorker => {
    // eslint-disable-next-line unicorn/no-missing-local-resource -- Compiled from `worker-node.ts` alongside this file
    const worker = new Worker(new URL('worker-node.js', import.meta.url));
    return wrapHashWorker(nodeEndpoint(worker), async () => worker.terminate());
};
