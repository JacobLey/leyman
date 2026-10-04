---
"iso-crypto": patch
---

Export `Ciphers`, `Modes`, `Sizes` and `Algorithms` as regular enums. As `const enum`s, the published declarations could not be used by consumers compiling with `isolatedModules` (e.g. swc, esbuild, Vite). The emitted JavaScript is unchanged.
