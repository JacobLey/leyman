---
description: Declare the queries a result leads to with propagate() and link(), so they load in parallel instead of in a waterfall.
---

# Linked queries

Data is often related: a book has an author, a list has its items. Loading the related data in the component that shows it creates a waterfall. The author's request can't start until the book has loaded, and the author component has rendered.

`.propagate()` declares the relationship next to the query, once. Inside it, `.link()` starts loading another resource, and returns a `Linked` reference to it:

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
import { resource } from 'normalized-react-query';

export const authors = resource({
    key: ({ authorId }: { authorId: number }) => ['authors', authorId],
    queryFn: ({ params }) => getAuthor(params.authorId),
});

export const books = resource({
    key: ({ bookId }: { bookId: number }) => ['books', bookId],
    queryFn: ({ params }) => getBook(params.bookId),
}).propagate(book => ({
    ...book,
    author: authors.link({ authorId: book.authorId }),
}));
```

As soon as a book loads, wherever it's loaded from (a hook, `.query()`, a prefetch), its author starts loading too. `propagate` returns a new resource, with the same key and cache entry, whose data has the extra `author` field.

## Read a linked query

The book's `author` is a `Linked` reference. Pass it to a `useNormalizedPrefetched*` hook, which reads the query it refers to:

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
import type { LinkOf } from 'normalized-react-query';
import {
    useNormalizedPrefetchedSuspenseQuery,
    useNormalizedSuspenseQuery,
} from 'normalized-react-query';

export const useBookTitle = (bookId: number) => {
    const { data: book } = useNormalizedSuspenseQuery(books, { bookId });
    return { title: book.title, author: book.author };
};

// In the author's component, given `book.author`
export const useAuthorName = (linked: LinkOf<typeof authors>) =>
    useNormalizedPrefetchedSuspenseQuery(linked).data.name;
```

`LinkOf<typeof authors>` types a prop that takes the link. A link that may be missing (e.g. `book.coAuthor ? coAuthors.link(...) : null`) is read with `useNormalizedNullablePrefetchedSuspenseQuery`, which returns `null` for `null` or `skipToken`.

## Rules for links

- `.link()` only works inside a `propagate` callback, and throws anywhere else. To start loading outside one, use `.prefetchQuery()` or `useNormalizedPrefetchQuery()`, which return a `Linked` too.
- Links aren't stored in the cache: the cache holds the plain data, and `propagate` runs again when the data is read, like a `select`. That keeps the cache serializable, for [server rendering](/normalized-react-query/guides/server-rendering).
- Linking the same query twice is safe. TanStack dedupes the requests.
- A linked resource can link further. The book's author can link to their publisher, and so on.
- `.link(params, options)` takes the options of `prefetchQuery`, plus `isolateErrors`: when `true`, a failure of that link doesn't fail a parent loaded with `awaitLinks`.

## Lists

A propagated value can be anything, including a list of links. For a page of users, link each one's detail query, so opening any of them is instant:

```ts
interface User {
    id: number;
    name: string;
}
declare const getUser: (id: number) => Promise<User>;
declare const listUsers: () => Promise<User[]>;
// ---cut---
import { resource } from 'normalized-react-query';

const users = resource({
    key: ({ id }: { id: number }) => ['users', id],
    queryFn: ({ params }) => getUser(params.id),
});

export const userList = resource({
    key: ['users', 'list'],
    queryFn: () => listUsers(),
}).propagate(list => list.map(user => ({ ...user, detail: users.link({ id: user.id }) })));
```
