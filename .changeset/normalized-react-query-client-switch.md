---
"normalized-react-query": minor
---

A `useNormalizedPrefetched*` hook throws when it is given a link on a different query client than the one it first rendered with (e.g. one that started without a link and has no `QueryClientProvider`). TanStack keeps a hook on its first client, so it used to read a separate cache: refetching the link's data and missing updates to it. `react` (`^18 || ^19`, as TanStack requires) is now a declared peer dependency.
