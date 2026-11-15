import type { Send } from '#internal/lib/request/compose.js';
import ky, { NetworkError } from 'ky';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { kySend } from '#internal/lib/request/ky.js';

/**
 * Sends with a Ky instance that retries a 503 once, and throws only for 503, over a fake `fetch`.
 *
 * @param respond - What the fake `fetch` answers each attempt with, by its index
 * @returns The send, and the method and body of each request the fake `fetch` got
 */
const withKy = (
    respond: (attempt: number) => Promise<Response>
): { send: Send; sent: { method: string; body: string }[] } => {
    const sent: { method: string; body: string }[] = [];
    const api = ky.create({
        fetch: async (input, init) => {
            const request = new Request(input, init);
            sent.push({ method: request.method, body: await request.text() });
            return respond(sent.length - 1);
        },
        retry: { limit: 1, delay: () => 0, statusCodes: [503], methods: ['get', 'post'] },
        throwHttpErrors: status => status === 503,
    });
    return { send: kySend(api), sent };
};

suite('kySend', () => {
    test('Returns an error status Ky does not throw for as the response, body intact', async () => {
        const { send, sent } = withKy(async () => new Response('missing', { status: 404 }));

        const response = await send(new Request('http://example.test'));

        expect(response.status).to.equal(404);
        expect(await response.text()).to.equal('missing');
        expect(sent).to.have.length(1);
    });

    test('Sends a GET again after a status Ky retries, and returns the answer to the retry', async () => {
        const { send, sent } = withKy(async attempt =>
            attempt === 0 ? new Response('busy', { status: 503 }) : new Response('done')
        );

        const response = await send(new Request('http://example.test'));

        expect(response.status).to.equal(200);
        expect(await response.text()).to.equal('done');
        expect(sent.map(({ method }) => method)).to.deep.equal(['GET', 'GET']);
    });

    test('Returns the retried status out of retries, with its status text and headers but not its length or encoding', async () => {
        const { send, sent } = withKy(
            async () =>
                new Response('busy', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: {
                        'content-encoding': 'identity',
                        'content-length': '4',
                        'retry-after': '1',
                    },
                })
        );

        const response = await send(new Request('http://example.test'));

        expect(response.status).to.equal(503);
        expect(response.statusText).to.equal('Service Unavailable');
        expect(response.headers.get('retry-after')).to.equal('1');
        expect(response.headers.has('content-encoding')).to.equal(false);
        expect(response.headers.has('content-length')).to.equal(false);
        expect(sent).to.have.length(2);
    });

    test('Returns the same JSON out of retries on a JSON response', async () => {
        const { send } = withKy(async () => Response.json({ message: 'Busy' }, { status: 503 }));

        const response = await send(new Request('http://example.test'));

        expect(response.status).to.equal(503);
        expect(response.headers.get('content-type')).to.equal('application/json');
        expect(await response.json()).to.deep.equal({ message: 'Busy' });
    });

    test('Returns the same text out of retries on a text response', async () => {
        const { send } = withKy(async () => new Response('busy', { status: 503 }));

        const response = await send(new Request('http://example.test'));

        expect(await response.text()).to.equal('busy');
    });

    test('Returns no body out of retries on a response without one', async () => {
        const { send } = withKy(async () => new Response(null, { status: 503 }));

        const response = await send(new Request('http://example.test'));

        expect(response.status).to.equal(503);
        expect(response.body).to.equal(null);
    });

    test('Sends a POST without an Idempotency-Key once, even when Ky retries POSTs', async () => {
        const { send, sent } = withKy(async () => new Response('busy', { status: 503 }));

        const response = await send(
            new Request('http://example.test', { method: 'POST', body: 'note' })
        );

        expect(response.status).to.equal(503);
        expect(await response.text()).to.equal('busy');
        expect(sent).to.deep.equal([{ method: 'POST', body: 'note' }]);
    });

    test('Sends a POST with an Idempotency-Key again, body and all', async () => {
        const { send, sent } = withKy(async attempt =>
            attempt === 0 ? new Response('busy', { status: 503 }) : new Response('done')
        );

        const response = await send(
            new Request('http://example.test', {
                method: 'POST',
                body: 'note',
                headers: { 'Idempotency-Key': 'key' },
            })
        );

        expect(response.status).to.equal(200);
        expect(await response.text()).to.equal('done');
        expect(sent).to.deep.equal([
            { method: 'POST', body: 'note' },
            { method: 'POST', body: 'note' },
        ]);
    });

    test('Rejects with the network error once a GET is out of retries', async () => {
        const { send, sent } = withKy(async () => {
            throw new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') });
        });

        await expect(send(new Request('http://example.test'))).to.be.rejectedWith(NetworkError);
        expect(sent).to.have.length(2);
    });

    test('Rejects with the network error at once for a POST without an Idempotency-Key', async () => {
        const { send, sent } = withKy(async () => {
            throw new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') });
        });

        await expect(
            send(new Request('http://example.test', { method: 'POST', body: 'note' }))
        ).to.be.rejectedWith(NetworkError);
        expect(sent).to.deep.equal([{ method: 'POST', body: 'note' }]);
    });
});
