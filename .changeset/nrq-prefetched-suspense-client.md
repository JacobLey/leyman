---
"normalized-react-query": patch
---

Fix `useNormalizedPrefetchedSuspenseQuery` reading from the context client instead of the link's client. It required a `QueryClientProvider`, and a link from another client suspended and refetched into the provider's cache, while its own links loaded into the link's client.
