---
"normalized-react-query": minor
---

Deprecate `fetchQuery`, `ensureQueryData`, `fetchInfiniteQuery` and `ensureInfiniteQueryData`, following React Query. Use `.query()` / `.infiniteQuery()`, with `{ staleTime: 'static', awaitLinks: true }` in place of the ensure methods.
