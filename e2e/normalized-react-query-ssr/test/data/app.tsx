import type { ReactNode } from 'react';
import type { LinkOf } from 'normalized-react-query';
import type { authorsWithFavorite } from './resources.js';
import { Suspense } from 'react';
import {
    useNormalizedNullablePrefetchedSuspenseQuery,
    useNormalizedPrefetchedSuspenseQuery,
    useNormalizedSuspenseQuery,
} from 'normalized-react-query';
import { booksWithAuthor } from './resources.js';

const Author = ({
    linked,
}: Readonly<{ linked: LinkOf<typeof authorsWithFavorite> }>): ReactNode => {
    const { data: author } = useNormalizedPrefetchedSuspenseQuery(linked);
    const favorite = useNormalizedNullablePrefetchedSuspenseQuery(author.favoriteAuthor);

    return (
        <p>
            By {author.name}
            {favorite ? `, who loves ${favorite.data.name}` : null}
        </p>
    );
};

const Book = ({ bookId }: Readonly<{ bookId: string }>): ReactNode => {
    const { data: book } = useNormalizedSuspenseQuery(booksWithAuthor, { bookId });

    return (
        <article>
            <h1>{book.title}</h1>
            <Author linked={book.author} />
        </article>
    );
};

// Renders a book, its author, and its author's favorite author: three queries, each linked from the last.
export const App = ({ bookId }: Readonly<{ bookId: string }>): ReactNode => (
    <Suspense fallback={<p>Loading...</p>}>
        <Book bookId={bookId} />
    </Suspense>
);
