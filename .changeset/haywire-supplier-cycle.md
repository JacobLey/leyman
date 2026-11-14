---
"haywire": patch
---

Fix an async container never settling a request when a supplier is called back to a singleton (or a request-scoped value, with a propagating supplier) while that value's deferred dependency is still being created. `container.check()` accepts these cycles, and they already resolved in a sync container. The supplier now gets the value as soon as its provider returns, while any other request for it still waits for its deferred dependencies.
