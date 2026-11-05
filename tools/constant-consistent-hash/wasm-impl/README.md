# constant-consistent-hash-wasm

[constant-consistent-hash](../constant-consistent-hash/) from TypeScript, through its [Rust implementation](../rust-impl/) compiled to WASM, on Node.js and in browsers.

```ts
import { consistentHash, hashKey } from '@leyman/constant-consistent-hash-wasm';

consistentHash('00000000-0000-4000-8000-000000000000', 7); // 2
hashKey('00000000-0000-4000-8000-000000000000'); // [865118427, 3574204183]
```

Both have the same signatures, results and errors as `constant-consistent-hash`, which checks Rust from the outside: every [test vector](../test-vectors/), lone surrogates, and the bounds of `range` and `seed`.

It is not published, and only exists to test the toolchain. **Use `constant-consistent-hash` instead**: a key crossing into WASM has to be copied, so this is slower, and the `.wasm` adds about 20 KB (9 KB gzipped). Measured on Node.js 24 on one arm64 machine, with a 36 character key:

|                  | TypeScript | WASM   |
| ---------------- | ---------- | ------ |
| `hashKey`        | 61 ns      | 246 ns |
| `consistentHash` | 73 ns      | 170 ns |

Compiling and loading the `.wasm` takes about 4 ms.

## On a frontend

Import it the same way. The `browser` condition selects an entry point that fetches the `.wasm` with a top-level `await`, so a bundler has to support both that and `new URL(..., import.meta.url)` assets. Vite does, with no plugin or configuration, in both its build and its dev server.

[`e2e-constant-consistent-hash-wasm-browser`](../../../e2e/constant-consistent-hash-wasm-browser/) builds an app that does this, and runs it in Chromium, Firefox and WebKit.
