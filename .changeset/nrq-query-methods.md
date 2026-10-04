---
"normalized-react-query": minor
---

Add `.query()` and `.infiniteQuery()`, mirroring `queryClient.query` and `queryClient.infiniteQuery`. They accept a `select` applied after propagation, and `awaitLinks` to wait for linked queries. `prefetchQuery` and `prefetchInfiniteQuery` also accept `awaitLinks`.
