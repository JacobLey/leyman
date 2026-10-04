import { setImmediate } from 'node:timers/promises';

export interface Author {
    id: string;
    name: string;
    favoriteAuthorId: string | null;
}

export interface Book {
    id: string;
    title: string;
    authorId: string;
}

export const tolkienId = 'tolkien';
export const austenId = 'austen';
export const fellowshipId = 'fellowship';

const authors = new Map<string, Author>([
    [tolkienId, { id: tolkienId, name: 'J.R.R. Tolkien', favoriteAuthorId: austenId }],
    [austenId, { id: austenId, name: 'Jane Austen', favoriteAuthorId: null }],
]);

const books = new Map<string, Book>([
    [fellowshipId, { id: fellowshipId, title: 'Fellowship of the Ring', authorId: tolkienId }],
]);

/**
 * Every request made in this process, to check what the client had to load itself.
 */
export const requests: string[] = [];

export const getAuthor = async (authorId: string): Promise<Author> => {
    requests.push(`author:${authorId}`);
    await setImmediate();
    const author = authors.get(authorId);
    if (!author) {
        throw new Error('404 Author not found');
    }
    return author;
};

export const getBook = async (bookId: string): Promise<Book> => {
    requests.push(`book:${bookId}`);
    await setImmediate();
    const book = books.get(bookId);
    if (!book) {
        throw new Error('404 Book not found');
    }
    return book;
};
