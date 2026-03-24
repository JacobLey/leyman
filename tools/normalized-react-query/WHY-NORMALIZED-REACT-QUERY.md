<div style="text-align:center">

# Why normalized-react-query?

</div>

## The Problem

[React Query](https://tanstack.com/query/v4) pairs "keys" (unique identifiers for a specific API call + params) with query functions. React Query handles caching, deduplication, and subscription behind the scenes.

The problem with manually pairing keys to functions is that nothing enforces consistency. The same key can be paired with different functions, and the same function can be registered under different keys. This leads to two failure modes:

- **Cache collision** — two calls share a key but expect different data. The second call silently uses the cached result of the first, with an incorrect type.
- **Cache miss** — two calls use different keys for the same data. Both fetch independently, defeating caching entirely.

```ts
import { useQuery } from '@tanstack/react-query';
import { getUsers } from './api/users.js';

const useExample = () => {
    const firstQuery = useQuery(
        ['users', 'get'],
        async () => {
            return getPosts();
        };
    );

    const secondQuery = useQuery(
        ['users', 'get'],
        async () => {
            // NEVER RUNS
            // Uses cached value of `firstQuery`.
            // Result is typed to include `{ decorate: boolean }` but that will never exist.
            const users = await getUsers();
            return users.map(user => {
                ...user,
                decorate: true,
            };
        };
    );

    const thirdQuery = useQuery(
        // Different key, same API call.
        // Triggers another fetch for data that already exists.
        ['users', 'fetch'],
        async () => {
            return getUsers();
        };
    );
};
```

`normalized-react-query` solves this by forcing the key and query function to be defined together in one place, then reused as a singleton. Every call site uses the same key and the same function — no divergence is possible.

---

## Why Not Native `useInfiniteQuery`?

React Query exports `useInfiniteQuery` natively, which provides similar behavior for paginated data. The decision to not use it in `Infinite` is based on a cache conflict: `useInfiniteQuery` queries cannot share a `queryKey` with `useQuery`. That means data fetched via `useInfiniteQuery` cannot benefit from the shared cache that regular queries use — pre-population, invalidation, and deduplication all break down at the boundary.

`normalized-react-query`'s `Infinite` class is implemented using TanStack's `useInfiniteQuery` hook directly, which means it shares the cache key space with `Resource`. Any usage of `Infinite.useQuery()` can benefit from data pre-populated by `Resource` queries and vice versa. Because `Infinite` extends `Resource`, it supports normal `useQuery` behavior as well.

---

→ [Back to README](./README.md)
