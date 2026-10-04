// eslint-disable-next-line import/no-unassigned-import, import/order -- registers DOM globals, so must load before `react-dom`
import '../data/dom.js';
import type { DehydratedState } from '@tanstack/react-query';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hydrate, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect } from '@leyman/expect';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { fellowshipId, requests } from '../data/api.js';
import { App } from '../data/app.js';

const serverPath = new URL('../data/server.js', import.meta.url);

const renderOnServer = async (
    bookId: string,
    { awaitLinks = true }: { awaitLinks?: boolean } = {}
): Promise<{ html: string; state: DehydratedState }> => {
    const { stdout } = await promisify(execFile)(globalThis.process.execPath, [
        serverPath.pathname,
        bookId,
        ...(awaitLinks ? [] : ['--no-await-links']),
    ]);
    return JSON.parse(stdout) as { html: string; state: DehydratedState };
};

const hydrateOnClient = (
    client: QueryClient,
    { html, state }: { html: string; state: DehydratedState }
) => {
    hydrate(client, state);

    const container = globalThis.document.createElement('div');
    container.innerHTML = html;
    globalThis.document.body.append(container);

    const recoverableErrors: unknown[] = [];
    render(
        <QueryClientProvider client={client}>
            <App bookId={fellowshipId} />
        </QueryClientProvider>,
        {
            container,
            hydrate: true,
            onRecoverableError: error => {
                recoverableErrors.push(error);
            },
        }
    );

    return { container, recoverableErrors };
};

suite('Server-side rendering', () => {
    const context = beforeEach(() => ({
        // Garbage collection timers would keep the process alive after the tests
        client: new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }),
    }));

    afterEach(() => {
        requests.length = 0;
    });

    context.test('Server renders every linked query', async () => {
        const { html } = await renderOnServer(fellowshipId);

        expect(html).to.include('Fellowship of the Ring');
        expect(html).to.include('J.R.R. Tolkien');
        expect(html).to.include('Jane Austen');
        expect(html).to.not.include('Loading...');
    });

    context.test('Client hydrates without loading anything', async ({ client }) => {
        const serverRender = await renderOnServer(fellowshipId);

        const { container, recoverableErrors } = hydrateOnClient(client, serverRender);

        expect(recoverableErrors).to.deep.equal([]);
        expect(container.innerHTML).to.equal(serverRender.html);
        expect(requests).to.deep.equal([]);
    });

    context.test('Client loads links the server did not wait for', async ({ client }) => {
        const serverRender = await renderOnServer(fellowshipId, { awaitLinks: false });
        expect(serverRender.html).to.include('Loading...');

        hydrateOnClient(client, serverRender);

        expect(await screen.findByText('By J.R.R. Tolkien, who loves Jane Austen')).to.not.equal(
            null
        );
        // The book itself was still sent by the server
        expect(requests).to.not.include(`book:${fellowshipId}`);
        expect(requests).to.include('author:tolkien');
    });
});
