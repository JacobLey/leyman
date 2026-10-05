# e2e-iso-crypto-browser

Checks that [`iso-crypto`](../../tools/iso-crypto)'s browser build works in real browsers, with no Node.js APIs.

[Vite](https://vite.dev) bundles `iso-crypto` as a browser app would, resolving the `browser` import conditions. The build fails if anything in it imports a Node.js module. [Playwright](https://playwright.dev) then loads the bundle into Chromium, Firefox and WebKit. The page is served from an intercepted `https` origin, because Web Crypto is only available in a secure context.

The tests check, in every browser, that:

- random bytes, hashing, encryption, key derivation and ECDH each call Web Crypto
- what the browser build hashes, derives or encrypts matches, or is readable by, the Node.js build, and the reverse

It is not published, and has no source of its own: only tests.

## Browsers

The `playwright-install` target downloads the browsers before the tests run, to `PLAYWRIGHT_BROWSERS_PATH` (shared between worktrees in the devcontainer). Their system libraries need root, so the devcontainer image and the Dagger pipeline install them. The Playwright version is pinned in `pnpm-workspace.yaml`, `.devcontainer/Dockerfile` and `dagger/main.go`, which must match.
