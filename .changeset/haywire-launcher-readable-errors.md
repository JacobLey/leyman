---
"haywire-launcher": patch
---

`launch()` with a container that can't provide the id, or an id without a `main` method, fails with a message saying which (`Property 'error' is missing ... '{ error: "Error: ..." }'`) instead of `Expected N arguments`.
