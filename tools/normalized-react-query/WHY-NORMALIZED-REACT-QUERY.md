<div style="text-align:center">

# Why normalized-react-query?

</div>

## The Problem

[TanStack Query](https://tanstack.com/query/latest) (React Query) pairs "keys" (unique identifiers for a specific API call + params) with query functions. React Query handles caching, deduplication, and subscription behind the scenes.

The problem with manually pairing keys to functions is that nothing enforces consistency. The same key can be paired with different functions, and the same function can be registered under different keys. This leads to two failure modes:

- **Cache collision** — two calls share a key but expect different data. The second call silently uses the cached result of the first, with an incorrect type.
- **Cache miss** — two calls use different keys for the same data. Both fetch independently, defeating caching entirely.

```ts
import { useQuery } from '@tanstack/react-query';
import { getUsers } from './api/users.js';

const useExample = () => {
    const firstQuery = useQuery({
        queryKey: ['users', 'get'],
        queryFn: () => getUsers(),
    });

    const secondQuery = useQuery({
        // Same key as `firstQuery`, so this queryFn NEVER RUNS.
        // The data is typed to include `decorated: true`, but it is the
        // cached value of `firstQuery`, which never has it.
        queryKey: ['users', 'get'],
        queryFn: async () => {
            const users = await getUsers();
            return users.map(user => ({ ...user, decorated: true }));
        },
    });

    const thirdQuery = useQuery({
        // Different key, same API call.
        // Triggers another fetch for data that already exists.
        queryKey: ['users', 'fetch'],
        queryFn: () => getUsers(),
    });
};
```

`normalized-react-query` solves this by forcing the key and query function to be defined together in one place, then reused as a singleton. Every call site uses the same key and the same function — no divergence is possible. Call sites pass typed params instead of building keys, and the cache helpers (`setQueryData`, `invalidateQuery`, …) are typed to the resource's data.

---

## Request Waterfalls

Data is often related: a book has an author, a list page has users. Fetching the related data in the component that renders it creates a waterfall — the child's request can't start until the parent's data has loaded _and_ the child has rendered. On the server, rendering has to wait for each level in turn.

`.propagate()` declares the relationship next to the query, once:

```ts
const books = resource<{ bookId: number }, Book>({
    key: ({ bookId }) => ['books', bookId],
    queryFn: ({ params }) => getBook(params.bookId),
}).propagate(book => ({
    ...book,
    author: authors.link({ authorId: book.authorId }),
}));
```

As soon as a book loads, its author starts prefetching, and the component receives a `Linked` reference to pass to `useNormalizedPrefetchedQuery`. For server-side rendering, `.query(queryClient, params, { awaitLinks: true })` loads the book and everything it links to before the cache is dehydrated.

---

## Infinite Queries

TanStack stores infinite (paginated) queries in a different shape from regular queries, so they need their own hooks and cache helpers. `infinite()` gives them the same treatment as `resource()`: one definition pairing the key, the query function and the page params, reused everywhere. It wraps TanStack's own `useInfiniteQuery` and `useSuspenseInfiniteQuery`, and supports `.propagate()`, so each page can link to the resources it contains.

---

## Comparisons

- [`queryOptions`](https://tanstack.com/query/latest/docs/framework/react/guides/query-options) — TanStack's own helper for sharing a key and query function with full typing. It is the closest built-in alternative. It is a plain options object per params value, so there are no params-typed cache helpers, linked prefetching, or SSR loading of related queries.
- [@lukemorales/query-key-factory](https://www.npmjs.com/package/@lukemorales/query-key-factory) — Organizes query keys (and optionally query functions) into a typed tree. It focuses on key structure and invalidation by prefix, not on linking queries or wrapping the hooks.
- [normalizr](https://www.npmjs.com/package/normalizr) — Normalizes nested API responses into entity tables. It is a different kind of normalization: `normalized-react-query` normalizes the mapping from key to fetcher, and leaves storage to TanStack's cache.

---

→ [Back to README](https://www.npmjs.com/package/normalized-react-query)
