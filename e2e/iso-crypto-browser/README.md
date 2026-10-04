# e2e-iso-crypto-browser

Checks that [`iso-crypto`](../../tools/iso-crypto)'s browser build runs on web APIs alone, with no Node.js APIs.

[Vite](https://vite.dev) bundles `iso-crypto` as a browser app would, resolving the `browser` import conditions. The build fails if anything in it imports a Node.js module. The bundle then runs in a [`vm`](https://nodejs.org/api/vm.html) context whose only globals are web APIs (`crypto`, `TextEncoder`, `TextDecoder`, `atob`, `btoa`), so Node.js globals like `process` or `Buffer` are not there to fall back on.

The tests check that:

- random bytes, hashing, encryption and ECC each call Web Crypto
- what the browser build hashes or encrypts matches, or is readable by, the Node.js build

It is not published, and has no source of its own: only tests.
