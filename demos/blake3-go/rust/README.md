# demo-blake3-go-rust

BLAKE3 from the [`blake3`](https://crates.io/crates/blake3) crate, compiled to WASM with SIMD behind a C ABI, for the [BLAKE3 from Go through WASM demo](../README.md). See [`go`](../go/README.md) for how to call it.

- **One function**, so what the demo measures is the hash and the boundary around it. It's the same crate as [blake3-wasm's](../../blake3-wasm/rust/README.md), copied rather than shared, as each demo shows one toolchain end to end.
- **A C ABI, not `wasm-bindgen`.** `wasm-bindgen` writes glue for JavaScript, which Go can't use. WASM functions only take and return numbers, so [`src/ffi.rs`](./src/ffi.rs) exports three of them: `alloc` reserves bytes in WASM's memory for the host to write into, `hash` reads the input and writes 32 bytes back, and `dealloc` frees what `alloc` reserved. Raw pointers need `unsafe`, which the workspace denies everywhere but that file.
- **No logic in the bindings.** `ffi.rs` only compiles for `wasm32`, so `cargo llvm-cov` never sees it. The Go tests run every test vector through it, which is what covers it.
- **The bare `.wasm` is the build.** A `cdylib` with no `wasm-bindgen` makes `rust-wasm` copy `demo_blake3_go.wasm` to `dist/` as it is, 40 KB.
- **The crate is a Go module too.** [`wasm.go`](./wasm.go) `//go:embed`s the `.wasm` and the test vectors, so the Go project imports them like any package. gonx infers the Nx dependency from that import, so the crate builds first. `dist/` isn't committed, so `go build` needs Nx (or `nx run @leyman/demo-blake3-go-rust:build`) to have run first. A module published for `go get` would commit the `.wasm` instead, as Go modules ship as source.
- **Test vectors** are [BLAKE3's official ones](./data/test-vectors.json), with each hash cut to 32 bytes.

```sh
nx run @leyman/demo-blake3-go-rust:verify
```
