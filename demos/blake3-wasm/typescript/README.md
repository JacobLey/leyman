# demo-blake3-wasm

BLAKE3 from Rust through WASM with SIMD, on Node.js and in browsers: blocking or in a worker. See the [demo's README](../README.md) for what was measured.

```ts
import { createHashWorker, hash } from '@leyman/demo-blake3-wasm';

// Blocks, like any function. 16 MiB takes about 9 ms
const digest = hash(bytes);

// Leaves this thread free. Keep it around: starting one takes 4 to 18 ms
await using worker = createHashWorker();
const digestInWorker = await worker.hash(largeBytes, { transfer: true });
```

## How it loads

- **Node.js** reads the `.wasm` with `readFileSync` at import, so `hash` is ready as soon as the import is.
- **Browsers** get a different entry point through the `browser` import condition, which fetches the `.wasm` with a top-level `await`. A bundler has to support that, and `new URL(..., import.meta.url)` assets. Vite does, with no plugin or configuration.
- **`new Worker(new URL('worker-browser.js', import.meta.url), { type: 'module' })`** has to be written just like that for bundlers to find it and build the worker as an entry point of its own, with its own copy of the `.wasm`.
- **A worker listens before it has loaded.** A message sent to a worker with no listener yet is lost, so [`worker-browser.ts`](./src/worker-browser.ts) exposes its API first, and each call awaits the load.

## Why Comlink

[Comlink](https://github.com/GoogleChromeLabs/comlink) is the usual way to call a worker: it matches each answer to its call, carries errors back, and handles transfers. [Piscina](https://github.com/piscinajs/piscina) and [Tinypool](https://github.com/tinylibs/tinypool) are the usual choices for a pool of workers on Node.js, which this doesn't need.

A worker with one function isn't much code without it, about 30 lines over `postMessage`, so this is a small convenience here rather than a necessity. Its packaging is dated, with UMD and no `exports`: [`comlink-node-adapter.d.ts`](./comlink-node-adapter.d.ts) exists because TypeScript can't find the types of its Node.js adapter. It also doesn't notice a worker dying, so a pending call never settles.

## Tests

- **Unit:** the official vectors and agreement with `@noble/hashes`, blocking and in a worker. The browser entry points run here too, with stand-ins for what a browser provides, which is what covers them.
- **Integration:** Vite builds an app that imports this package, failing on any import of a Node.js module, and it runs in Chromium, Firefox and WebKit: every vector on the page and in a worker, the page staying free during a large hash, and transfer leaving the input empty.

## Bench

```sh
nx run @leyman/demo-blake3-wasm:tsc-test
pnpm bench
```

Prints tables and JSON, in under 2 minutes, and no single measurement blocks for over a second. Never in CI: a timing would fail for no reason on a loaded machine. [`test/unit/tight-blake3.spec.ts`](./test/unit/tight-blake3.spec.ts) holds the JavaScript baseline to the same vectors, as a wrong baseline would make every comparison wrong.
