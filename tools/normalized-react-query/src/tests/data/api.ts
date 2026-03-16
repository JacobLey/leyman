import { delayImmediate, getId } from './utils.js';

export interface Author {
    id: string;
    name: string;
    favoriteAuthorId: string | null;
}

export interface Book {
    id: string;
    title: string;
    author: Author;
}

export const tolkienId = getId();
export const orwellId = getId();
export const austenId = getId();
export const kingId = getId();

export const fellowshipOfTheRingId = getId();
export const prideAndPrejudiceId = getId();
export const longWalkId = getId();
export const shiningId = getId();

const authors = [
    {
        id: tolkienId,
        name: 'J.R.R. Tolkien',
        favoriteAuthorId: austenId,
        books: [
            {
                id: getId(),
                title: 'The Hobbit',
            },
            {
                id: fellowshipOfTheRingId,
                title: 'Fellowship of the Ring',
            },
            {
                id: getId(),
                title: 'The Two Towers',
            },
            {
                id: getId(),
                title: 'Return of the King',
            },
        ],
    },
    {
        id: orwellId,
        name: 'George Orwell',
        favoriteAuthorId: kingId,
        books: [
            {
                id: getId(),
                title: 'Nineteen Eighty-Four',
            },
            {
                id: getId(),
                title: 'Animal Farm',
            },
        ],
    },
    {
        id: austenId,
        name: 'Jane Austen',
        favoriteAuthorId: null,
        books: [
            {
                id: prideAndPrejudiceId,
                title: 'Pride and Prejudice',
            },
        ],
    },
    {
        id: kingId,
        name: 'Stephen King',
        favoriteAuthorId: orwellId,
        books: [
            { id: shiningId, title: 'The Shining' },
            { id: getId(), title: 'It' },
            { id: getId(), title: 'Carrie' },
            { id: getId(), title: 'The Stand' },
            { id: getId(), title: 'Misery' },
            { id: getId(), title: 'Pet Sematary' },
            { id: getId(), title: 'Cujo' },
            { id: getId(), title: "Salem's Lot" },
            { id: longWalkId, title: 'The Long Walk' },
            { id: getId(), title: 'The Dead Zone' },
        ],
    },
];

const authorsMap = new Map(authors.map(author => [author.id, author]));

export const getAuthor = async (id: string): Promise<Author> => {
    await delayImmediate();

    const author = authorsMap.get(id);
    if (!author) {
        throw new Error('404 Author not found');
    }
    return {
        id: author.id,
        name: author.name,
        favoriteAuthorId: author.favoriteAuthorId,
    };
};

export const listAuthors = async ({ offset }: { offset: number }): Promise<Author[]> => {
    await delayImmediate();

    return [...authorsMap.values()].slice(offset, offset + 2);
};

const booksMap = new Map(
    authors.flatMap(author =>
        author.books.map(book => [
            book.id,
            {
                ...book,
                authorId: author.id,
            },
        ])
    )
);

export const getBook = async (id: string): Promise<Book> => {
    await delayImmediate();

    const book = booksMap.get(id);
    if (!book) {
        throw new Error('404 Book not found');
    }

    return {
        id: book.id,
        title: book.title,
        author: await getAuthor(book.authorId),
    };
};

export const listBooksByAuthor = async ({
    authorId,
    offset,
}: {
    authorId: string;
    offset: number;
}): Promise<
    {
        id: string;
        title: string;
    }[]
> => {
    await delayImmediate();

    const author = await getAuthor(authorId);

    const books = [...booksMap.values()]
        .filter(book => book.authorId === author.id)
        .map(book => ({
            id: book.id,
            title: book.title,
        }));

    return books.slice(offset, offset + 2);
};
