import init from '@leyman/constant-consistent-hash-rust';

// Fetches the `.wasm` file next to the bindings, which a bundler emits as an asset. Compiled once, on first import
await init();

export * from './consistent-hash.js';
