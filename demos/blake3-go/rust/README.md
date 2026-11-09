# demo-blake3-go-rust

BLAKE3 from the [`blake3`](https://crates.io/crates/blake3) crate, compiled to WASM with SIMD behind a C ABI, for the [BLAKE3 from Go through WASM demo](../README.md). See [`go`](../go/README.md) for how to call it.

- The crate has one function, so what the demo measures is the hash and the boundary around it. It's the same crate as [blake3-wasm's](../../blake3-wasm/rust/README.md), copied rather than shared, since each demo shows one toolchain end to end.
- It uses a C ABI rather than `wasm-bindgen`, which writes glue for JavaScript that Go can't use. WASM functions only take and return numbers, so [`src/ffi.rs`](./src/ffi.rs) exports three of them. `alloc` reserves bytes in WASM's memory for the host to write into, `hash` reads the input and writes 32 bytes back, and `dealloc` frees what `alloc` reserved. Raw pointers need `unsafe`, which the workspace denies everywhere except that file.
- The bindings hold no logic. `ffi.rs` only compiles for `wasm32`, so `cargo llvm-cov` doesn't see it, and it's covered by the Go tests running every test vector through it.
- The build output is the bare `.wasm`. A `cdylib` with no `wasm-bindgen` makes `rust-wasm` copy `demo_blake3_go.wasm` to `dist/` as it is, at 40 KB.
- The crate is a Go module too. [`wasm.go`](./wasm.go) `//go:embed`s the `.wasm` and the test vectors, so the Go project imports them like any package, and gonx infers the Nx dependency from that import, so the crate builds first. `dist/` isn't committed, so `go build` needs Nx (or `nx run @leyman/demo-blake3-go-rust:build`) to have run first. A module published for `go get` would commit the `.wasm` instead, since Go modules ship as source.
- The test vectors are [BLAKE3's official ones](./data/test-vectors.json), with each hash cut to 32 bytes.

```sh
nx run @leyman/demo-blake3-go-rust:verify
```
