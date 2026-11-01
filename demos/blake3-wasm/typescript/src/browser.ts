import type { HashWorker } from './lib/hash-worker.js';
import init from '@leyman/demo-blake3-wasm-rust';
import { wrapHashWorker } from './lib/hash-worker.js';

export type { HashOptions, HashWorker } from './lib/hash-worker.js';
export { hash } from '@leyman/demo-blake3-wasm-rust';

// Fetches the `.wasm` file next to the bindings, which a bundler emits as an asset
await init();

/**
 * Starts a Web Worker that hashes, so that a large input doesn't block the page.
 *
 * Written exactly as bundlers look for it, to build the worker as an entry point of its own.
 *
 * @returns the worker, to close when done with it
 */
export const createHashWorker = (): HashWorker => {
    // eslint-disable-next-line unicorn/no-missing-local-resource -- Compiled from `worker-browser.ts` alongside this file
    const worker = new Worker(new URL('worker-browser.js', import.meta.url), { type: 'module' });
    return wrapHashWorker(worker, () => {
        worker.terminate();
    });
};
