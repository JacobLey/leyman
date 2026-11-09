---
"idempotency-keys": patch
---

Hash a `^` in the request path as `%5E` on every Node.js version. The WHATWG URL serialization encodes it, but Node.js 22.12's `URL` doesn't, so the same request hashed differently on the lowest supported Node.js than on newer ones.
