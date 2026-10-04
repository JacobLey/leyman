/**
 * Renders the app as a server would, in its own process so nothing is shared with the client but its output.
 *
 * Usage: `node server.js <book-id> [--no-await-links]`
 *
 * Prints the rendered HTML and dehydrated cache as JSON.
 */
import { dehydrate, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { App } from './app.js';
import { booksWithAuthor } from './resources.js';

const [bookId = '', flag] = globalThis.process.argv.slice(2);

const client = new QueryClient();
// eslint-disable-next-line n/no-top-level-await -- runs as a script, never imported
await booksWithAuthor.query(
    client,
    { bookId },
    { staleTime: 'static', awaitLinks: flag !== '--no-await-links' }
);

const html = renderToString(
    <QueryClientProvider client={client}>
        <App bookId={bookId} />
    </QueryClientProvider>
);

globalThis.process.stdout.write(JSON.stringify({ html, state: dehydrate(client) }));
