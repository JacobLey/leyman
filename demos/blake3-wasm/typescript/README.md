# demo-blake3-wasm

BLAKE3 from Rust through WASM with SIMD, on Node.js and in browsers, run blocking or in a worker, and measured against JavaScript to find where WASM pays off. See the [demo's README](../README.md) for the results.

```ts
import { createHashWorker, hash } from '@leyman/demo-blake3-wasm';

// Blocks, like any function. 16 MiB takes about 9 ms
const digest = hash(bytes);

// Leaves this thread free. Keep it around: starting one takes 4 to 18 ms
await using worker = createHashWorker();
const digestInWorker = await worker.hash(largeBytes, { transfer: true });
```

## How it loads

- On Node.js, the package reads the `.wasm` with `readFileSync` when it's imported, so `hash` is ready as soon as the import is.
- Browsers get a different entry point through the `browser` import condition, which fetches the `.wasm` with a top-level `await`. A bundler has to support that, and `new URL(..., import.meta.url)` assets. Vite does, with no plugin or configuration.
- `new Worker(new URL('worker-browser.js', import.meta.url), { type: 'module' })` has to be written exactly like that for bundlers to find it, and build the worker as an entry point of its own, with its own copy of the `.wasm`.
- A worker starts listening before it has loaded. A message sent to a worker with no listener yet is lost, so [`worker-browser.ts`](./src/worker-browser.ts) exposes its API first, and each call waits for the load.

## Why Comlink

[Comlink](https://github.com/GoogleChromeLabs/comlink) is the usual way to call a worker. It matches each answer to its call, carries errors back, and handles transfers. [Piscina](https://github.com/piscinajs/piscina) and [Tinypool](https://github.com/tinylibs/tinypool) are the usual choices for a pool of workers on Node.js, which this demo doesn't need.

A worker with one function isn't much code without Comlink (about 30 lines over `postMessage`), so here it's a small convenience rather than a necessity. Its packaging is dated, with UMD and no `exports`, and [`comlink-node-adapter.d.ts`](./comlink-node-adapter.d.ts) only exists because TypeScript can't find the types of its Node.js adapter. It also doesn't notice when a worker dies, so a pending call never settles.

## Tests

- The unit tests run the official vectors and check agreement with `@noble/hashes`, both blocking and in a worker. The browser entry points run here too, with stand-ins for what a browser provides, and that's what covers them.
- In the integration tests, Vite builds an app that imports this package, failing on any import of a Node.js module, and the app runs in Chromium, Firefox and WebKit. It checks every vector on the page and in a worker, that the page stays responsive during a large hash, and that a transfer leaves the input empty.

## Bench

```sh
nx run @leyman/demo-blake3-wasm:tsc-test
pnpm bench
```

The bench prints tables and JSON in under 2 minutes, and no single measurement blocks for more than a second. It doesn't run in CI, where a timing would fail for no reason on a loaded machine. [`test/unit/tight-blake3.spec.ts`](./test/unit/tight-blake3.spec.ts) holds the JavaScript baseline to the same vectors, since a wrong baseline would make every comparison wrong.
