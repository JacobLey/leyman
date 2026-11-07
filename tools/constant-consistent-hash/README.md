# constant-consistent-hash

Consistent hashing in constant time with no loops: stateless, evenly balanced, and only moves keys to new buckets.

Every implementation follows one [specification](./ts/SPEC.md), written over UTF-8 bytes and 32-bit integer operations so any language can return exactly the same bucket:

- **Constant time, no loops**: a fixed amount of work per lookup, whatever the number of buckets (up to 2^48).
- **Minimal disruption**: growing from n to n + 1 buckets moves only 1/(n + 1) of keys, all of them to the new bucket.
- **Evenly balanced**: every bucket is equally likely, with no virtual nodes or tuning.
- **Stateless**: a key and a bucket count are all it needs.

For the design, see [WHY-CONSTANT-CONSISTENT-HASH.md](./ts/WHY-CONSTANT-CONSISTENT-HASH.md).

## Packages

| Package | Status |
|---------|--------|
| [`ts`](./ts/) | Published to npm as [`constant-consistent-hash`](https://www.npmjs.com/package/constant-consistent-hash), with the specification |
| [`go`](./go/) | The Go implementation, in this repository only |
| [`rust`](./rust/) | The Rust implementation, compiled to WASM, in this repository only |
| [`wasm`](./wasm/) | The Rust implementation from TypeScript, on Node.js and in browsers, in this repository only |
| [`weighted-rendezvous-hash`](./weighted-rendezvous-hash/) | Published to npm as [`weighted-rendezvous-hash`](https://www.npmjs.com/package/weighted-rendezvous-hash): weighted rendezvous hashing, for any set of nodes, built on the TypeScript implementation |

The Go and Rust implementations are written from the specification, not translated from the TypeScript source, and every implementation returns exactly the buckets of the shared [test vectors](./test-vectors/).
