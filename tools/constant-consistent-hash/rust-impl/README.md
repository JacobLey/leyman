# constant-consistent-hash-rust

Rust implementation of [constant-consistent-hash](../constant-consistent-hash/), compiled to WASM for TypeScript, and tested against the shared test vectors.

Like the [Go implementation](../go-impl/), it is written from the [specification](../constant-consistent-hash/SPEC.md), not translated from the TypeScript source, so agreeing on every [test vector](../test-vectors/) checks the specification. It also exists to keep the path from Rust source to a TypeScript call working: the toolchain, the Nx targets, the WASM build and CI.

```rust
use constant_consistent_hash_rust::bucket;

let shard = bucket("00000000-0000-4000-8000-000000000000", 7, 0)?;
// 2
```

`bucket(key, buckets, seed)` returns a bucket in `[0, buckets)`, or `BucketsOutOfBounds` when `buckets` is not between 1 and 2^48. `hash_key(key, seed)` returns the two 32 bit words a key hashes to.

It is not published as a crate, and has no runtime dependencies outside WASM. From TypeScript, use [`@leyman/constant-consistent-hash-wasm`](../wasm-impl/) rather than the bindings in this package's `dist/`.

## Development

Run through Nx, like any other project:

```sh
nx run @leyman/constant-consistent-hash-rust:verify
```

`cargo test` works directly too. It is a member of the Cargo workspace in the repo's root, which holds the one `Cargo.lock` and `target/`.

- [`src/lib.rs`](./src/lib.rs) is the implementation, with no dependencies. Tests hold it to 100% coverage.
- [`src/wasm.rs`](./src/wasm.rs) is the bindings, compiled only for WASM. `cargo llvm-cov` runs natively and never sees it, so it holds no logic, and `wasm-impl`'s tests are what run it.
- `package.json` only exists to export the output of `rust-wasm` to TypeScript: the `.wasm`, and the bindings from `wasm-bindgen --target web`, which can load it in a browser.

The test vectors are a dev dependency by path, so Nx (through [the repo's plugin](../../../leyman/main/scripts/nx-rust-plugin.mjs)) reruns the tests when they change.
