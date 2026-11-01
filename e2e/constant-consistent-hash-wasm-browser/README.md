# e2e-constant-consistent-hash-wasm-browser

Checks that [`constant-consistent-hash`](../../tools/constant-consistent-hash/constant-consistent-hash)'s [Rust implementation](../../tools/constant-consistent-hash/rust-impl), compiled to WASM, bundles for a frontend and runs in real browsers.

[Vite](https://vite.dev) builds an application that imports [`@leyman/constant-consistent-hash-wasm`](../../tools/constant-consistent-hash/wasm-impl), resolving the `browser` import conditions. The build fails if anything in it imports a Node.js module, and has to emit the `.wasm` as a file of its own, as any application build would. [Playwright](https://playwright.dev) then hosts that output and opens it in Chromium, Firefox and WebKit.

The tests check, in every browser, that:

- the page fetches the `.wasm` file
- every [test vector](../../tools/constant-consistent-hash/test-vectors) comes back through Rust
- lone surrogates, which only UTF-16 strings can hold, hash as they do in the TypeScript implementation

It is not published, and has no source of its own: only tests.

Browsers are installed as for [`e2e-iso-crypto-browser`](../iso-crypto-browser/README.md#browsers).
