---
"weighted-rendezvous-hash": patch
---

`moved(next)` throws a `TypeError` that says what's wrong when `next` wasn't built by `createRendezvousHash`, such as a hash from another installed copy of the package. It used to fail with "Cannot read properties of undefined".
