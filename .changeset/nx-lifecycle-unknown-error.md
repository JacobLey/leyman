---
"nx-lifecycle": patch
---

`explain` prints the message of whatever its lookup throws, using [`unknown-error`](https://www.npmjs.com/package/unknown-error)'s `getErrorMessage`, instead of assuming an Error (which printed `undefined` for anything else).
