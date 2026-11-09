# constant-consistent-hash

Stateless consistent hashing in constant time with no loops, which only moves keys into a newly added bucket.

`constant-consistent-hash` maps a key to one of `n` buckets (up to 2^48) with a fixed amount of work per lookup. Adding a bucket only moves the keys the new bucket needs, and every bucket gets an equal share. There is no ring or table to keep, since a lookup only uses the key and the bucket count.

Every implementation follows one [specification](./ts/SPEC.md), written over UTF-8 bytes and 32-bit integer operations so that any language returns exactly the same bucket. For how the algorithm works, see [WHY-CONSTANT-CONSISTENT-HASH.md](./ts/WHY-CONSTANT-CONSISTENT-HASH.md).

## Packages

| Package | Status |
|---------|--------|
| [`ts`](./ts/) | Published to npm as [`constant-consistent-hash`](https://www.npmjs.com/package/constant-consistent-hash), with the specification |
| [`go`](./go/) | The Go implementation, in this repository only |
| [`rust`](./rust/) | The Rust implementation, compiled to WASM, in this repository only |
| [`wasm`](./wasm/) | The Rust implementation from TypeScript, on Node.js and in browsers, in this repository only |
| [`weighted-rendezvous-hash`](./weighted-rendezvous-hash/) | Published to npm as [`weighted-rendezvous-hash`](https://www.npmjs.com/package/weighted-rendezvous-hash). Weighted rendezvous hashing for any set of nodes, built on the TypeScript implementation |

The Go and Rust implementations were written from the specification rather than translated from the TypeScript source, and every implementation returns exactly the buckets of the shared [test vectors](./test-vectors/).
