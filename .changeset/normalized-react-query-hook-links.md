---
"normalized-react-query": patch
---

A linked query that fails no longer causes an unhandled promise rejection when nothing waits for it: in hooks, or in `query()` without `awaitLinks`. Its error is still in the linked query's state. Hooks also no longer keep every link they create for the life of the query client.
