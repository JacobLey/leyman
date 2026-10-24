---
description: Type-safe query definitions for TanStack Query. Define each key and fetcher once, and link related queries so they prefetch together.
---

# normalized-react-query

Type-safe query definitions for [TanStack Query](https://tanstack.com/query/latest). Define each key and fetcher once, and link related queries so they prefetch together.

```ts
interface Author {
    name: string;
}
interface Book {
    title: string;
    authorId: number;
}
declare const getAuthor: (id: number) => Promise<Author>;
declare const getBook: (id: number) => Promise<Book>;
// ---cut---
import { resource, useNormalizedQuery } from 'normalized-react-query';

const authors = resource({
    key: ({ authorId }: { authorId: number }) => ['authors', authorId],
    queryFn: ({ params }) => getAuthor(params.authorId),
});

// When a book loads, its author starts loading too
const books = resource({
    key: ({ bookId }: { bookId: number }) => ['books', bookId],
    queryFn: ({ params }) => getBook(params.bookId),
}).propagate(book => ({ ...book, author: authors.link({ authorId: book.authorId }) }));

export const useBook = (bookId: number) => useNormalizedQuery(books, { bookId });
```

Every component that needs a book calls `useNormalizedQuery(books, { bookId })`. The key and the fetcher can't drift apart, and the params are typed.

**[Get started →](/packages/normalized-react-query/getting-started)**

## Features

- **One definition per query**: `resource()` pairs a key with its fetcher, so one key can never hold two kinds of data, and the same data is never fetched under two keys.
- **Typed by params**: call sites pass `{ bookId: 1 }`, not a hand-built key array. Reads, writes and invalidation (`setQueryData`, `invalidateQuery`, …) are typed to the resource's data.
- **Linked queries, no waterfalls**: `.propagate()` declares the queries a result leads to, which start loading as soon as it does. See [Linked queries](/packages/normalized-react-query/guides/linked-queries).
- **Server rendering in one call**: `.query(client, params, { awaitLinks: true })` loads a query and everything it links to, ready to dehydrate. See [Server rendering](/packages/normalized-react-query/guides/server-rendering).
- **Every hook**: plain, suspense, nullable (`skipToken`), infinite and prefetched versions of TanStack's hooks. See [Infinite queries](/packages/normalized-react-query/guides/infinite-queries).
- **Just TanStack underneath**: caching, refetching and subscriptions are TanStack's own. This package only decides keys, fetchers and types.

## Compared to

- TanStack's own [`queryOptions`](https://tanstack.com/query/latest/docs/framework/react/guides/query-options) also pairs a key with its fetcher, but as one options object per params value. There are no params-typed cache helpers, linked prefetching, or server loading of related queries.
- [@lukemorales/query-key-factory](https://www.npmjs.com/package/@lukemorales/query-key-factory) organizes keys (and optionally fetchers) into a typed tree, for invalidating by prefix. It doesn't link queries or wrap the hooks.
- [normalizr](https://www.npmjs.com/package/normalizr) normalizes nested responses into entity tables. normalized-react-query normalizes the mapping from key to fetcher instead, and leaves storage to TanStack's cache.
