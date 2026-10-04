import { infinite, resource } from 'normalized-react-query';
import { getAuthor, getBook, listAuthors, listBooksByAuthor } from './api.js';

export const authors = resource({
    key: ({ authorId }: { authorId: string }) => ['authors', authorId],
    queryFn: async ({ params }) => {
        const { favoriteAuthorId, ...author } = await getAuthor(params.authorId);
        return {
            ...author,
            favoriteAuthor: favoriteAuthorId === null ? null : { authorId: favoriteAuthorId },
        };
    },
});

export const infiniteAuthors = infinite<void, { authorId: string }[], { offset: number }>({
    key: ['authors'],
    getInitialPageParam: { offset: 0 },
    getNextPageParam: ({ lastPage, lastPageParam }) => {
        if (lastPage.length === 0) {
            return null;
        }
        return { offset: lastPageParam.offset + lastPage.length };
    },
    queryFn: async ({ client, pageParam }) => {
        const listedAuthors = await listAuthors(pageParam);

        return listedAuthors.map(({ favoriteAuthorId, ...author }) =>
            authors.populate(
                client,
                { authorId: author.id },
                {
                    ...author,
                    favoriteAuthor:
                        favoriteAuthorId === null
                            ? null
                            : authors.getParams({ authorId: favoriteAuthorId }),
                }
            )
        );
    },
});

export const books = resource({
    key: ({ bookId }: { bookId: string }) => ['books', bookId],
    queryFn: async ({ params, client }) => {
        const {
            author: { favoriteAuthorId, ...author },
            ...book
        } = await getBook(params.bookId);
        return {
            ...book,
            author: authors.populate(
                client,
                { authorId: author.id },
                {
                    ...author,
                    favoriteAuthor:
                        favoriteAuthorId === null
                            ? null
                            : authors.getParams({ authorId: favoriteAuthorId }),
                }
            ),
        };
    },
});

export const infiniteBooksByAuthor = infinite({
    key: ({ authorId }: { authorId: string }) => ['authors', authorId, 'books'],
    getInitialPageParam: () => ({ offset: 0 }),
    getPreviousPageParam: (): undefined => {},
    queryFn: async ({ client, params, pageParam }) => {
        const bookPages = await listBooksByAuthor({
            ...params,
            ...pageParam,
        });
        return bookPages.map(book =>
            books.populate(
                client,
                { bookId: book.id },
                {
                    ...book,
                    author: authors.getParams({ authorId: params.authorId }),
                }
            )
        );
    },
    getNextPageParam: ({ lastPage, lastPageParam }) => {
        if (lastPage.length === 0) {
            return null;
        }
        return { offset: lastPageParam.offset + lastPage.length };
    },
});
