import type { AddressInfo } from 'node:net';
import type {
    ApiError,
    NewNote,
    Note,
    NoteList,
    OperationInput,
    OperationResult,
} from '@leyman/demo-openapi-client';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { expectTypeOf } from 'expect-type';
import {
    NotesClient,
    NotesClientError,
    NotesClientUnexpectedStatusError,
} from '@leyman/demo-openapi-client';
import { expect } from '@leyman/expect';
import { beforeEach, suite, test } from 'mocha-chain';

const note: Note = {
    id: '6a2f41a3-c54c-fce8-32d2-0324e1c32e22',
    title: 'Dolly',
    body: 'A sheep',
    createdAt: '2026-10-20T00:00:00.000Z',
};

suite('NotesClient', () => {
    test("Takes each operation's parameters and body", () => {
        expectTypeOf<OperationInput<'getNote'>>().toEqualTypeOf<{
            readonly path: { noteId: string };
        }>();
        expectTypeOf<OperationInput<'listNotes'>>().toEqualTypeOf<{
            readonly query?: { limit?: number };
        }>();
        expectTypeOf<OperationInput<'createNote'>>().toEqualTypeOf<{ readonly body: NewNote }>();
    });

    test('Returns each documented response', () => {
        expectTypeOf<OperationResult<'getNote'>>().toEqualTypeOf<
            | { readonly status: 200; readonly body: Note }
            | { readonly status: 400; readonly body: ApiError }
            | { readonly status: 404; readonly body: ApiError }
        >();
        expectTypeOf<OperationResult<'listNotes'>>().toEqualTypeOf<
            | { readonly status: 200; readonly body: NoteList }
            | { readonly status: 400; readonly body: ApiError }
        >();
    });

    /**
     * A `fetch` that records each request, and answers each with a new copy of the response set by `respond`.
     */
    const withFetch = beforeEach(() => {
        const requests: Request[] = [];
        let next: { readonly body: unknown; readonly status: number } = { body: note, status: 200 };
        const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            requests.push(new Request(input, init));
            return Response.json(next.body, { status: next.status });
        };
        const respond = (body: unknown, status = 200): void => {
            next = { body, status };
        };
        return { requests, fetch, respond };
    });

    withFetch.test(
        'Gets a note by its id, from the path in the spec',
        async ({ requests, fetch }) => {
            const client = new NotesClient({ baseUrl: 'http://notes.test', fetch });

            const result = await client.call('getNote', { path: { noteId: note.id } });

            expect(result).to.deep.equal({ status: 200, body: note });
            expect(requests[0]?.method).to.equal('GET');
            expect(requests[0]?.url).to.equal(`http://notes.test/notes/${note.id}`);
        }
    );

    withFetch.test('Encodes path parameters', async ({ requests, fetch }) => {
        const client = new NotesClient({ baseUrl: 'http://notes.test', fetch });

        await client.call('getNote', { path: { noteId: 'a/b?c' } });

        expect(requests[0]?.url).to.equal('http://notes.test/notes/a%2Fb%3Fc');
    });

    withFetch.test("Keeps the base URL's path", async ({ requests, fetch }) => {
        const client = new NotesClient({ baseUrl: new URL('http://notes.test/api'), fetch });

        await client.call('getNote', { path: { noteId: note.id } });

        expect(requests[0]?.url).to.equal(`http://notes.test/api/notes/${note.id}`);
    });

    withFetch.test('Sends query parameters', async ({ requests, fetch, respond }) => {
        respond({ items: [] });
        const client = new NotesClient({ baseUrl: 'http://notes.test', fetch });

        await client.call('listNotes', { query: { limit: 5 } });

        expect(requests[0]?.url).to.equal('http://notes.test/notes?limit=5');
    });

    withFetch.test(
        'Leaves out query parameters not given',
        async ({ requests, fetch, respond }) => {
            respond({ items: [] });
            const client = new NotesClient({ baseUrl: 'http://notes.test', fetch });

            await Promise.all([
                client.call('listNotes', {}),
                client.call('listNotes', { query: {} }),
            ]);

            expect(requests.map(({ url }) => url)).to.deep.equal([
                'http://notes.test/notes',
                'http://notes.test/notes',
            ]);
        }
    );

    withFetch.test('Posts the body as JSON', async ({ requests, fetch, respond }) => {
        respond(note, 201);
        const client = new NotesClient({ baseUrl: 'http://notes.test', fetch });

        const result = await client.call('createNote', {
            body: { title: 'Dolly', body: 'A sheep' },
        });

        expect(result).to.deep.equal({ status: 201, body: note });
        expect(requests[0]?.method).to.equal('POST');
        expect(requests[0]?.headers.get('content-type')).to.equal('application/json');
        expect(await requests[0]?.json()).to.deep.equal({ title: 'Dolly', body: 'A sheep' });
    });

    withFetch.test(
        'Sends the token to secured operations',
        async ({ requests, fetch, respond }) => {
            respond(note, 201);
            const client = new NotesClient({
                baseUrl: 'http://notes.test',
                token: 'secret',
                fetch,
            });

            await client.call('createNote', { body: { title: 'Dolly', body: 'A sheep' } });

            expect(requests[0]?.headers.get('authorization')).to.equal('Bearer secret');
        }
    );

    withFetch.test('Never sends the token to public operations', async ({ requests, fetch }) => {
        const client = new NotesClient({ baseUrl: 'http://notes.test', token: 'secret', fetch });

        await client.call('getNote', { path: { noteId: note.id } });

        expect(requests[0]?.headers.has('authorization')).to.equal(false);
    });

    withFetch.test('Sends no token without one', async ({ requests, fetch, respond }) => {
        respond({ code: 'unauthorized', message: 'No token' }, 401);
        const client = new NotesClient({ baseUrl: 'http://notes.test', fetch });

        const result = await client.call('createNote', {
            body: { title: 'Dolly', body: 'A sheep' },
        });

        expect(result.status).to.equal(401);
        expect(requests[0]?.headers.has('authorization')).to.equal(false);
    });

    withFetch.test('Rejects a status the spec does not document', async ({ fetch, respond }) => {
        respond({}, 500);
        const client = new NotesClient({ baseUrl: 'http://notes.test', fetch });

        await expect(client.call('getNote', { path: { noteId: note.id } })).to.be.rejectedWith(
            NotesClientUnexpectedStatusError
        );
    });

    withFetch.test('Throws errors that share a base class', async ({ fetch, respond }) => {
        respond({}, 500);
        const client = new NotesClient({ baseUrl: 'http://notes.test', fetch });

        await expect(client.call('getNote', { path: { noteId: note.id } })).to.be.rejectedWith(
            NotesClientError
        );
    });

    test('Uses the global fetch by default', async () => {
        const server = createServer((_request, response) => {
            response
                .writeHead(200, { 'content-type': 'application/json' })
                .end(JSON.stringify(note));
        });
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        try {
            const { port } = server.address() as AddressInfo;
            const client = new NotesClient({ baseUrl: `http://127.0.0.1:${port}` });

            expect(await client.call('getNote', { path: { noteId: note.id } })).to.deep.equal({
                status: 200,
                body: note,
            });
        } finally {
            server.close();
        }
    });
});
