# e2e-normalized-react-query-ssr

Checks that [`normalized-react-query`](../../tools/normalized-react-query)'s preloading carries across a server render into client hydration.

A server preloads a book with `query(..., { staleTime: 'static', awaitLinks: true })`, renders it with `renderToString`, and dehydrates its cache. The server runs in its own process, so the client shares nothing with it but that output. Links are not serializable, so the client has to rebuild them from the hydrated cache.

The tests check that:

- the server HTML includes every linked query, not a Suspense fallback
- the client hydrates that HTML without a mismatch, and without making any requests
- a link the server did not wait for is loaded by the client instead

The client runs in [Happy DOM](https://github.com/capricorn86/happy-dom), registered globally before `react-dom` loads.

It is not published, and has no source of its own: only tests.
