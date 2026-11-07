---
description: 'The same Rust crate called from Go with no cgo: a C ABI built to bare WASM, run by wazero, and measured against BLAKE3 in Go and native Rust to find where it pays off.'
---

# BLAKE3 from Go through WASM

<ProjectHeader />

How do you call Rust from Go, and when is it worth it? This builds the [BLAKE3](https://github.com/BLAKE3-team/BLAKE3) crate to WASM behind a C ABI, runs it in Go with [wazero](https://wazero.io), and measures it against BLAKE3 in Go to find out. It's the Go version of [BLAKE3 through WASM](../blake3-wasm/), which does the same for JavaScript.

A worked example, not a package: nothing here is published.

| Package                                                                     | What it is                                                                                                          | README                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [`rust`](https://github.com/JacobLey/leyman/tree/main/demos/blake3-go/rust) | The [`blake3`](https://crates.io/crates/blake3) crate, built for WASM with SIMD behind a C ABI, and embedded for Go | [The crate and its build](https://github.com/JacobLey/leyman/blob/main/demos/blake3-go/rust/README.md) |
| [`go`](https://github.com/JacobLey/leyman/tree/main/demos/blake3-go/go)     | Loading it with wazero and calling it, its tests, and the bench                                                     | [How to use it](https://github.com/JacobLey/leyman/blob/main/demos/blake3-go/go/README.md)             |

## Why WASM and wazero

Go can call Rust three ways:

|                                   | How                                                                                   | Cost                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WASM, with wazero** (this demo) | The crate's `.wasm` is embedded with `//go:embed`, and wazero, written in Go, runs it | No cgo, so `go build` still cross-compiles, and `go get` users need no Rust. Sandboxed. Slower than native code, and bytes are copied into WASM's memory |
| cgo                               | The crate builds a static library with a C ABI, which cgo links                       | Native speed. Needs a C toolchain, gives up cross-compiling, and Go modules ship as source, so users need cargo or a prebuilt library for each platform  |
| purego                            | Go loads the crate's shared library at runtime with `dlopen`, no cgo                  | No C toolchain, but still a native library for each platform, found and loaded at runtime                                                                |

WASM keeps Go's tooling as it is, which is usually the point of choosing Go. The bench below includes native Rust, to show what cgo would gain.

## How it's built

```
rust/src/lib.rs ── the crate's one function
rust/src/ffi.rs ── alloc, dealloc, hash: a C ABI over pointers into WASM's memory
       │ cargo build --target wasm32-unknown-unknown (rust-wasm)
       ▼
rust/dist/demo_blake3_go.wasm ── 40 KB, not committed
       │ //go:embed, in rust/wasm.go: the crate's directory is a Go module too
       ▼
go/blake3.go ── wazero compiles it once (Module), instantiates it per goroutine (Hasher)
```

- **Nx orders it.** gonx sees `go` import the crate's Go package and infers the dependency, so the crate builds first. `go-test` also hashes the crate's Rust source, so it runs again when the crate changes, though only the `.wasm` it builds is embedded.
- **No `wasm-bindgen`.** Its glue is JavaScript. A WASM function only takes and returns numbers, so Go writes the input into WASM's memory at an address `alloc` returned, calls `hash` with that address, and reads 32 bytes back. That's the whole C ABI.

## What was measured

`go test -run '^$' -bench . -benchtime 2s -count 5` in [`go`](https://github.com/JacobLey/leyman/tree/main/demos/blake3-go/go), with Go 1.27 and wazero 1.12, median of 5:

- **`go`**: [`zeebo/blake3`](https://github.com/zeebo/blake3), the Go library you would reach for. It has assembly for amd64, but not for arm64, which this ran on.
- **`wasm`**: this demo, through wazero's compiler.
- **native**: the same crate built for the machine, with NEON, timed once in a separate Rust program. It's what cgo would get, before cgo's own cost per call.

Warm, time per call:

|    Bytes |         go |       wasm |     native | V8 (blake3-wasm) |
| -------: | ---------: | ---------: | ---------: | ---------------: |
|        0 |      88 ns |     212 ns |            |                  |
|       64 |      96 ns |     215 ns |      66 ns |           0.3 µs |
|     1 Ki |     1.2 µs |     2.1 µs |     1.0 µs |           2.2 µs |
|     3 Ki |     4.3 µs |     6.5 µs |     3.1 µs |           6.3 µs |
| **4 Ki** | **5.5 µs** | **3.1 µs** | **2.4 µs** |       **2.5 µs** |
|    64 Ki |      82 µs |      51 µs |      40 µs |            36 µs |
|     1 Mi |    1.30 ms |    0.77 ms |    0.63 ms |          0.56 ms |
|    16 Mi |    20.8 ms |    12.4 ms |     9.7 ms |           9.1 ms |

The last column is [blake3-wasm's](../blake3-wasm/#what-was-measured) Node.js figures for the same crate, on the same machine.

From nothing to a first hash of 64 bytes, in a running process:

|                                                                       |    Time |
| --------------------------------------------------------------------- | ------: |
| Compile and instantiate, with the compiler                            | 14.4 ms |
| The same, with wazero's compilation cache on disk from an earlier run |  1.3 ms |
| Compile and instantiate, with the interpreter                         |  3.5 ms |
| Only instantiate, from a compiled module                              |  0.7 ms |

## What was learned

- **It pays off at 4 KiB, as it did in JavaScript.** BLAKE3 hashes 1 KiB chunks, and the crate's SIMD runs on 4 at once. Below that, Go is ahead by 1.5x to 2.2x. From 4 KiB on, WASM is 1.6x to 1.8x faster than Go.
- **Each call costs about 0.1 µs to cross.** An empty hash takes 212 ns through wazero and 88 ns in Go, which is the call, the copy and the empty hash in WASM together. That only matters for small inputs, where Go is ahead anyway.
- **wazero's compiler is 1.3x behind native and V8.** At 16 MiB, native NEON takes 9.7 ms and V8 runs the same `.wasm` in 9.1 ms, where wazero takes 12.4 ms. wazero compiles in one quick pass rather than optimizing like V8, so cgo would save about a fifth of the time here, at the cost of everything in [the table above](#why-wasm-and-wazero).
- **Compiling is the startup cost, and the cache removes most of it.** 14 ms to compile is what about 27 MiB of hashing saves over Go. With the compilation cache on disk it's 1.3 ms, worth it from about 2.5 MiB. For a server that compiles once at startup, neither matters.
- **Keep instances, don't make one per call.** Instantiating takes 0.7 ms, most likely for the memory a Rust module starts with, over 1 MiB for its stack. That's 20x cheaper than compiling, but 200x a 4 KiB hash. Give each goroutine its own, or pool them.
- **The interpreter isn't for this.** It's 80x to 120x slower than Go, as it runs each instruction in turn rather than compiling them. wazero only picks it where its compiler doesn't run (platforms other than amd64 and arm64), so check where a program will run before relying on WASM for speed.

## What this leaves out

- **One machine:** arm64 under Linux, in a container. On amd64, `zeebo/blake3` uses AVX2 assembly, so it may well beat WASM there, and the crossover would move or go away.
- **A fresh process:** the cold numbers are in a running process, so they leave out starting Go itself.
- **Optimization level:** the `.wasm` is built for size (`opt-level = "s"`, the workspace's setting for WASM), as in blake3-wasm, while native Rust was built for speed.
- **cgo itself:** native Rust is timed on its own, without cgo's cost per call or its build. A cgo package beside this one would show both.
- **Concurrency:** the bench uses one goroutine. Each `Hasher` has its own memory, so they should scale with cores, but that isn't measured.
- **Memory:** each instance keeps WASM's memory as large as the largest input it hashed, 16 MiB after the bench. Hashing a large input in parts (`blake3::Hasher::update`) would cap that.

It has no external services, so what it's tested against is the official test vectors, through both of wazero's engines.
