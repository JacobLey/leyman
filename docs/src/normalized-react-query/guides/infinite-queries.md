---
description: Define paginated TanStack queries with infinite(), including their page params, and link each page's items.
---

# Infinite queries

TanStack keeps paginated ("infinite") queries in a different shape from other queries, so they have their own hooks and cache methods. `infinite()` defines them like `resource()`: one definition holding the key, the fetcher and the page params.

```ts
interface Post {
    id: number;
    title: string;
}
declare const listPosts: (author: string, cursor: number) => Promise<{ posts: Post[]; next: number | null }>;
// ---cut---
import { infinite, useNormalizedInfiniteQuery } from 'normalized-react-query';

export const posts = infinite({
    key: ({ author }: { author: string }) => ['posts', author],
    queryFn: ({ params, pageParam }) => listPosts(params.author, pageParam),
    getInitialPageParam: 0,
    getNextPageParam: ({ lastPage }) => lastPage.next,
});

export const usePosts = (author: string) => {
    const { data, fetchNextPage, hasNextPage } = useNormalizedInfiniteQuery(posts, { author });
    //      ^?
    return { pages: data?.pages, fetchNextPage, hasNextPage };
};
```

- `queryFn` is called once per page, with the params and that page's `pageParam`.
- `getInitialPageParam` is the first page's param, or a function of the params.
- `getNextPageParam` returns the next page's param, or `null`/`undefined` when there are no more. `getPreviousPageParam`, optional, does the same backwards.

## Hooks

The hooks mirror TanStack's: `useNormalizedInfiniteQuery`, `useNormalizedSuspenseInfiniteQuery`, `useNormalizedNullableSuspenseInfiniteQuery` (which returns `null` for `skipToken`), and the prefetch variants. Their data is TanStack's `InfiniteData`: `{ pages, pageParams }`.

## Link each page's items

`.propagate()` runs once per page, with `{ page, pageParam }`. Linking each item starts loading its own query as soon as the page arrives:

```ts
interface Post {
    id: number;
    title: string;
}
declare const getPost: (id: number) => Promise<Post>;
declare const listPosts: (cursor: number) => Promise<Post[]>;
// ---cut---
import { infinite, resource } from 'normalized-react-query';

const post = resource({
    key: ({ id }: { id: number }) => ['posts', id],
    queryFn: ({ params }) => getPost(params.id),
});

export const feed = infinite({
    key: ['feed'],
    queryFn: ({ pageParam }) => listPosts(pageParam),
    getInitialPageParam: 0,
    getNextPageParam: ({ lastPage, lastPageParam }) =>
        lastPage.length > 0 ? lastPageParam + 1 : undefined,
}).propagate(({ page }) => page.map(item => ({ ...item, full: post.link({ id: item.id }) })));
```

See [Linked queries](/normalized-react-query/guides/linked-queries) for how links are read.

## Cache methods

An infinite query has the same cache methods as a resource (`invalidateQuery`, `getQueryData`, …), plus `infiniteQuery()`, `prefetchInfiniteQuery()` and `setInfiniteQueryData()`, which work on every loaded page. See the [API reference](/normalized-react-query/reference/api#infinite-params).
