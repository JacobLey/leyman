# e2e-unknown-error-browser

Checks that [`unknown-error`](../../tools/unknown-error) runs in real browsers, with and without `Error.isError`.

[Vite](https://vite.dev) bundles `unknown-error` as a browser app would, and the build fails if anything in it imports a Node.js module. [Playwright](https://playwright.dev) then loads the bundle into Chromium, Firefox and WebKit, twice each: once as the browser ships, and once with `Error.isError` removed, so every engine also runs the fallback that older browsers depend on.

The tests check, in every browser and both modes, that:

- thrown values, including Proxies that throw from every trap, are converted without throwing
- Errors from another realm (an iframe) are recognized, and their codes matched
- cause chains and `AggregateError` entries are walked and formatted, with the `Name: message` line that Firefox and Safari stacks leave out
- very deep and circular cause chains end

It is not published, and has no source of its own: only tests.

## Browsers

The `playwright-install` target downloads the browsers before the tests run. See [e2e-iso-crypto-browser](../iso-crypto-browser/README.md#browsers) for how they are installed and kept in sync.
