---
description: BLAKE3 from Rust through WASM with SIMD, on Node.js and in browsers, blocking or in a worker, measured against the fastest JavaScript to find where WASM pays off.
---

# BLAKE3 through WASM

<ProjectHeader />

This demo measures where WebAssembly pays off. It hashes with [BLAKE3](https://github.com/BLAKE3-team/BLAKE3) from Rust, on Node.js and in browsers, either blocking or in a worker, and compares it with the best JavaScript.

It's a worked example rather than a package, and nothing here is published.

| Package                                                                                   | What it is                                                                               | README                                                                                                                 |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`rust`](https://github.com/JacobLey/leyman/tree/main/demos/blake3-wasm/rust)             | The [`blake3`](https://crates.io/crates/blake3) crate, built for WASM with SIMD          | [The crate and its build](https://github.com/JacobLey/leyman/blob/main/demos/blake3-wasm/rust/README.md)               |
| [`typescript`](https://github.com/JacobLey/leyman/tree/main/demos/blake3-wasm/typescript) | The same API on both platforms, with a worker, its tests in real browsers, and the bench | [How to use it, and how it loads](https://github.com/JacobLey/leyman/blob/main/demos/blake3-wasm/typescript/README.md) |

## What was measured

`pnpm bench` in [`typescript`](https://github.com/JacobLey/leyman/tree/main/demos/blake3-wasm/typescript) runs this on Node.js 24, Chromium, Firefox and WebKit, each with three implementations of the same function:

- `noble` is [`@noble/hashes`](https://github.com/paulmillr/noble-hashes), the JavaScript library you would reach for. It's written to be easy to audit rather than to be fast.
- `tight` is [the fastest JavaScript I could write](https://github.com/JacobLey/leyman/blob/main/demos/blake3-wasm/typescript/test/bench/tight-blake3.ts), with every step inlined and all state in local variables. It would be unpleasant to maintain, and it's only there as a fair baseline. Without it, this demo would credit WASM with what is mostly noble's choice to be readable.
- `wasm` is this demo.

Warm, time per call:

|    Bytes | Node.js: noble |      tight |       wasm | Chromium: tight |       wasm | Firefox: tight |       wasm | WebKit: tight |       wasm |
| -------: | -------------: | ---------: | ---------: | --------------: | ---------: | -------------: | ---------: | ------------: | ---------: |
|       64 |         1.6 µs |     0.2 µs |     0.3 µs |          0.2 µs |     0.4 µs |         0.2 µs |     0.4 µs |        0.2 µs |     0.3 µs |
|     1 Ki |        16.1 µs |     1.5 µs |     2.2 µs |          1.6 µs |     2.2 µs |         2.3 µs |     2.0 µs |        1.8 µs |     2.0 µs |
|     3 Ki |        49.6 µs |     4.4 µs |     6.3 µs |          4.5 µs |     6.5 µs |         7.1 µs |     5.9 µs |        5.4 µs |     5.8 µs |
| **4 Ki** |        68.0 µs | **5.8 µs** | **2.5 µs** |      **6.0 µs** | **2.6 µs** |     **9.6 µs** | **2.6 µs** |    **7.3 µs** | **4.2 µs** |
|    64 Ki |        1.04 ms |      94 µs |      36 µs |           95 µs |      36 µs |         154 µs |      36 µs |        118 µs |      65 µs |
|     1 Mi |        16.8 ms |    1.50 ms |    0.56 ms |         1.51 ms |    0.55 ms |        2.44 ms |    0.57 ms |       1.91 ms |    1.00 ms |
|    16 Mi |         273 ms |    24.2 ms |     9.1 ms |         24.3 ms |     8.9 ms |        39.0 ms |     9.0 ms |       31.0 ms |    15.5 ms |

From nothing loaded to a first result, in a fresh process or page:

| Bytes | Node.js: tight |    wasm | Chromium: tight |    wasm | Firefox: tight |  wasm | WebKit: tight |  wasm |
| ----: | -------------: | ------: | --------------: | ------: | -------------: | ----: | ------------: | ----: |
|    64 |         1.0 ms |  5.9 ms |          2.3 ms |  2.7 ms |           5 ms |  2 ms |          3 ms |  3 ms |
| 16 Ki |         2.5 ms |  5.6 ms |          5.7 ms |  2.6 ms |           5 ms |  2 ms |          5 ms |  3 ms |
| 64 Ki |         5.4 ms |  6.0 ms |          8.8 ms |  2.6 ms |           8 ms |  3 ms |          8 ms |  4 ms |
|  1 Mi |        12.1 ms |  6.7 ms |         11.8 ms |  3.8 ms |          36 ms |  4 ms |         15 ms |  5 ms |
| 16 Mi |        35.4 ms | 16.9 ms |         35.4 ms | 14.0 ms |          74 ms | 21 ms |         55 ms | 27 ms |

## What was learned

- WASM pays off after only a few microseconds of work here. Warm, it passes the best JavaScript at 4 KiB, which is about 6 µs of work, and stays about 2x to 4x ahead after that. It beats noble at every size measured.
- The crossover happens all at once, between 3 KiB and 4 KiB. BLAKE3 hashes 1 KiB chunks, and the crate's SIMD only runs on 4 of them at once. At 3 KiB JavaScript is usually ahead, and at 4 KiB WASM is well ahead. Without SIMD, WASM was 1.5x faster than tight JavaScript in a one-off Node.js run, against 2.7x with SIMD.
- WASM wins most on a cold start. A first call runs in JavaScript's slowest tier, while WASM runs at full speed from the start. In browsers, starting from nothing loaded, WASM is ahead once the input reaches 16 KiB, at the latest. On Node.js it takes until somewhere between 64 KiB and 1 MiB, because importing this package there takes about 5 ms.
- How long the work takes doesn't decide it. This repo's [constant-consistent-hash through WASM](https://github.com/JacobLey/leyman/tree/main/tools/constant-consistent-hash/wasm) stays 1.6x slower than TypeScript, even at 30 ms of work, because both are 32-bit integer math that a JIT does well. What decides it is whether the work is something JavaScript can't do well, like SIMD here, or 64-bit math.
- Most of the gap to a library may have nothing to do with WASM. Tight JavaScript is 11x faster than noble on Node.js, and the figure is higher still on Chromium, though only 1.8x on WebKit. If a hot path is slow, a better JavaScript implementation may be enough.

## When to use a worker

A call into WASM blocks its thread, as any JavaScript function does, so the question is how long a thread can be held, which has little to do with WASM itself. A 60 FPS frame is 16 ms, which WASM reaches at about 28 MiB here, and tight JavaScript at about 11 MiB.

Measured with [Comlink](https://github.com/GoogleChromeLabs/comlink) at 16 MiB:

|                                        | Node.js | Chromium | Firefox | WebKit |
| -------------------------------------- | ------: | -------: | ------: | -----: |
| Start a worker, through a first answer |   18 ms |     8 ms |   11 ms |   4 ms |
| Round trip, copying the bytes          | 11.4 ms |  14.8 ms |   14 ms |  18 ms |
| Round trip, transferring the bytes     |  9.0 ms |   9.3 ms |   10 ms |  17 ms |

An empty round trip took 64 µs on Node.js, and was below the browsers' clock resolution. So keep a worker running rather than starting one per call, and only use one for work that would otherwise block for too long.

## What this leaves out

- Everything ran on one machine, arm64 under Linux, in a container. WebKit is Playwright's Linux build rather than Safari. Firefox's clock only resolves to 1 ms, so its small cold numbers are rough.
- Pages are served from memory, so a cold browser number has no download in it. A browser would also have to fetch the `.wasm`, which is 37 KB (13 KB gzipped).
- Bundle size compared with noble, and memory use, weren't measured.
- This is one hash, chosen because it should favor WASM. It says nothing about work that doesn't use SIMD or 64-bit math.

There are no external services to test against, so the tests run in real browsers.
