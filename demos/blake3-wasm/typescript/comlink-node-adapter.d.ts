/* eslint-disable import-x/unambiguous, jsdoc/require-jsdoc -- Declares another package's module, documented there */

// Comlink's adapter ships its types as `node-adapter.d.ts`, which TypeScript doesn't match to `node-adapter.mjs`
declare module 'comlink/dist/esm/node-adapter.mjs' {
    import type { MessagePort, Worker } from 'node:worker_threads';
    import type { Endpoint } from 'comlink';

    export default function nodeEndpoint(endpoint: MessagePort | Worker): Endpoint;
}
