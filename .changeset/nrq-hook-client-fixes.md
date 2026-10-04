---
"normalized-react-query": patch
---

Fix hooks that render without a link (or with `skipToken`) before they get one. Tanstack hooks stay on the client they first render with, so these hooks never read the link's client and kept rendering placeholder data (or, for the nullable suspense hooks, suspended forever when params were later skipped). Disabled hooks now render with the context client.

Stop cancelling in-flight queries whose last observer unmounts (e.g. every query under `StrictMode`). The query context was spread to add `params`, which reads `signal` and tells Tanstack the query can be aborted.
