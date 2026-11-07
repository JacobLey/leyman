import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initSync } from '@leyman/constant-consistent-hash-rust';

const wasmPath = fileURLToPath(import.meta.resolve('@leyman/constant-consistent-hash-rust/wasm'));

initSync({ module: readFileSync(wasmPath) });

export * from './consistent-hash.js';
