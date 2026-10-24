---
description: Load a query and everything it links to before rendering on the server, then hydrate the cache on the client.
---

# Server rendering

On the server, everything a page shows must be loaded before it's rendered, or the HTML is a loading state. With [linked queries](/packages/normalized-react-query/guides/linked-queries), one call loads a query and every query it links to:

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
import { resource } from 'normalized-react-query';
const authors = resource({
    key: ({ authorId }: { authorId: number }) => ['authors', authorId],
    queryFn: ({ params }) => getAuthor(params.authorId),
});
const books = resource({
    key: ({ bookId }: { bookId: number }) => ['books', bookId],
    queryFn: ({ params }) => getBook(params.bookId),
}).propagate(book => ({ ...book, author: authors.link({ authorId: book.authorId }) }));
// ---cut---
import { dehydrate, QueryClient } from '@tanstack/react-query';

export const loadBookPage = async (bookId: number) => {
    const client = new QueryClient();

    // The book, its author, and anything the author links to
    await books.query(client, { bookId }, { staleTime: 'static', awaitLinks: true });

    return { client, state: dehydrate(client) };
};
```

- `awaitLinks: true` waits for every link, at every level, and rejects if any fails. A link with `isolateErrors: true` can fail without failing the page, and is loaded again on the client.
- `staleTime: 'static'` uses data already in the cache as it is, so nothing loads twice.

Render the app with the same `QueryClient` (in a `QueryClientProvider`), then send the dehydrated `state` with the HTML.

## On the client

Hydrate the state into the client's `QueryClient` with TanStack's `HydrationBoundary` or `hydrate()`, and render the same components. The hooks find their data in the cache, so nothing is requested again.

Links aren't stored in the cache, so they don't need to be serialized. `propagate` runs again when the hooks read the hydrated data, which rebuilds them, pointing at queries that are already in the cache.

A link the server didn't wait for (without `awaitLinks`, or a failed `isolateErrors` link) is loaded by the client when its data is read, as usual.

[e2e/normalized-react-query-ssr](https://github.com/JacobLey/leyman/tree/main/e2e/normalized-react-query-ssr) renders a book, its author and the author's favorite author in a separate server process, and checks that the client hydrates it without a mismatch, and without any requests.
