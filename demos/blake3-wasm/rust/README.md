# demo-blake3-wasm-rust

The [`blake3`](https://crates.io/crates/blake3) crate, built for WASM with SIMD, for the [BLAKE3 through WASM demo](../README.md). See [`typescript`](../typescript/README.md) for how to call it.

- **One function**, so what the demo measures is the hash and the boundary around it.
- **SIMD comes from the crate's `wasm32_simd` feature**, only on `wasm32`. It needs no compiler flags, as the crate marks the functions that use it, and browsers have shipped WASM SIMD since 2023. Native tests use whatever the crate picks for the platform.
- **The bindings copy.** `wasm-bindgen` copies the input into WASM's memory and the output back out. That's fine for a hash that reads every byte anyway, and the bench includes it.
- **Test vectors** are [BLAKE3's official ones](./data/test-vectors.json), with each hash cut to 32 bytes, and are exported so that TypeScript runs them through WASM too. `cargo llvm-cov` only sees the native build, so that is what covers [`src/wasm.rs`](./src/wasm.rs).

```sh
nx run @leyman/demo-blake3-wasm-rust:verify
```
