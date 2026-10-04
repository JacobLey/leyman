import { resource } from 'normalized-react-query';
import { getAuthor, getBook } from './api.js';

export const authors = resource({
    key: ({ authorId }: { authorId: string }) => ['authors', authorId],
    queryFn: async ({ params }) => getAuthor(params.authorId),
});

export const authorsWithFavorite = authors.propagate(author => ({
    ...author,
    favoriteAuthor: author.favoriteAuthorId
        ? authors.link({ authorId: author.favoriteAuthorId })
        : null,
}));

export const books = resource({
    key: ({ bookId }: { bookId: string }) => ['books', bookId],
    queryFn: async ({ params }) => getBook(params.bookId),
});

export const booksWithAuthor = books.propagate(book => ({
    ...book,
    author: authorsWithFavorite.link({ authorId: book.authorId }),
}));
