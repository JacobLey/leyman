import type { KySendOptions, Send } from '@leyman/demo-fetch-middleware';
import { NetworkError, TimeoutError } from 'ky';
import { kySend } from '@leyman/demo-fetch-middleware';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

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
    const send = kySend({
        fetch: async (input, init) => {
            const request = new Request(input, init);
            sent.push({ method: request.method, body: await request.text() });
            return respond(sent.length - 1);
        },
        retry: { limit: 1, delay: () => 0, statusCodes: [503] },
    });
    return { send, sent };
};

/**
 * A delay no test waits out: a test that waits for it fails on Mocha's timeout.
 */
const hang = 2_147_483_647;

/**
 * Sends with a Ky instance that retries a 503 once, which the fake `fetch` answers with the given `Retry-After`
 * the first time and `done` after.
 *
 * @param retryAfter - The first response's `Retry-After`
 * @param retry - Ky's other retry options
 * @returns The send, and each request the fake `fetch` got
 */
const withRetryAfter = (
    retryAfter: string,
    retry: Omit<KySendOptions['retry'], 'limit' | 'statusCodes'>
): { send: Send; sent: Request[] } => {
    const sent: Request[] = [];
    const send = kySend({
        fetch: async (input, init) => {
            sent.push(new Request(input, init));
            return sent.length === 1
                ? new Response('busy', { status: 503, headers: { 'retry-after': retryAfter } })
                : new Response('done');
        },
        retry: { ...retry, limit: 1, statusCodes: [503] },
    });
    return { send, sent };
};

suite('kySend', () => {
    test('Returns an error status it does not retry as the response, body intact', async () => {
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

    test('Returns the retried status out of retries as it came, status text, headers and all', async () => {
        const { send, sent } = withKy(
            async () =>
                new Response('busy', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'content-length': '4', 'x-request-id': 'id' },
                })
        );

        const response = await send(new Request('http://example.test'));

        expect(response.status).to.equal(503);
        expect(response.statusText).to.equal('Service Unavailable');
        expect(response.headers.get('content-length')).to.equal('4');
        expect(response.headers.get('x-request-id')).to.equal('id');
        expect(await response.text()).to.equal('busy');
        expect(sent).to.have.length(2);
    });

    test('Returns a JSON string body out of retries as JSON', async () => {
        const { send } = withKy(async () => Response.json('busy', { status: 503 }));

        const response = await send(new Request('http://example.test'));

        expect(response.headers.get('content-type')).to.equal('application/json');
        expect(await response.json()).to.equal('busy');
    });

    test('Returns a body labelled JSON that is not out of retries as it came', async () => {
        const { send } = withKy(
            async () =>
                new Response('<html>Bad Gateway</html>', {
                    status: 503,
                    headers: { 'content-type': 'application/json' },
                })
        );

        const response = await send(new Request('http://example.test'));

        expect(await response.text()).to.equal('<html>Bad Gateway</html>');
    });

    test('Returns a JSON body out of retries digit for digit, even with a parseJson of its own', async () => {
        const body = '{"id":12345678901234567890}';
        const send = kySend({
            fetch: async () =>
                new Response(body, {
                    status: 503,
                    headers: { 'content-type': 'application/json' },
                }),
            parseJson: text => BigInt(/\d+/v.exec(text)?.[0] ?? '0'),
            retry: { limit: 1, delay: () => 0, statusCodes: [503] },
        });

        const response = await send(new Request('http://example.test'));

        expect(await response.text()).to.equal(body);
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

    test('Sends a PATCH with an Idempotency-Key again', async () => {
        const { send, sent } = withKy(async attempt =>
            attempt === 0 ? new Response('busy', { status: 503 }) : new Response('done')
        );

        const response = await send(
            new Request('http://example.test', {
                method: 'PATCH',
                body: 'note',
                headers: { 'Idempotency-Key': 'key' },
            })
        );

        expect(await response.text()).to.equal('done');
        expect(sent.map(({ method }) => method)).to.deep.equal(['PATCH', 'PATCH']);
    });

    test('Sends a QUERY again, as it is idempotent', async () => {
        const { send, sent } = withKy(async attempt =>
            attempt === 0 ? new Response('busy', { status: 503 }) : new Response('done')
        );

        const response = await send(
            new Request('http://example.test', { method: 'QUERY', body: 'select' })
        );

        expect(await response.text()).to.equal('done');
        expect(sent).to.deep.equal([
            { method: 'QUERY', body: 'select' },
            { method: 'QUERY', body: 'select' },
        ]);
    });

    test('Waits as long as Retry-After asks, instead of its own delay', async () => {
        const { send, sent } = withRetryAfter('0', { delay: () => hang });

        const response = await send(new Request('http://example.test'));

        expect(await response.text()).to.equal('done');
        expect(sent).to.have.length(2);
    });

    test('Waits as long as a Retry-After date asks, none once it passed', async () => {
        const { send } = withRetryAfter('Thu, 01 Jan 1970 00:00:00 GMT', { delay: () => hang });

        const response = await send(new Request('http://example.test'));

        expect(await response.text()).to.equal('done');
    });

    test('Cuts a Retry-After longer than maxRetryAfter to it', async () => {
        const { send } = withRetryAfter('3600', { delay: () => 0, maxRetryAfter: 1 });

        const response = await send(new Request('http://example.test'));

        expect(await response.text()).to.equal('done');
    });

    test('Uses its own delay for a Retry-After it cannot read', async () => {
        const { send } = withRetryAfter('soon', { delay: () => 0 });

        const response = await send(new Request('http://example.test'));

        expect(await response.text()).to.equal('done');
    });

    test('Uses its own delay for a status not in afterStatusCodes', async () => {
        const { send } = withRetryAfter('3600', { delay: () => 0, afterStatusCodes: [429] });

        const response = await send(new Request('http://example.test'));

        expect(await response.text()).to.equal('done');
    });

    test('Keeps the hooks it is given, running them before its own', async () => {
        const seen: number[] = [];
        const send = kySend({
            fetch: async () => new Response('busy', { status: 503 }),
            hooks: {
                afterResponse: [
                    ({ response }) => {
                        seen.push(response.status);
                    },
                ],
            },
            retry: { limit: 1, delay: () => 0, statusCodes: [503] },
        });

        const response = await send(new Request('http://example.test'));

        expect(response.status).to.equal(503);
        expect(seen).to.deep.equal([503, 503]);
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

    test('Sends a GET again after its first attempt times out, and returns the answer to the retry', async () => {
        const sent: Request[] = [];
        const send = kySend({
            fetch: async (input, init) => {
                const request = new Request(input, init);
                sent.push(request);
                if (sent.length > 1) {
                    return new Response('done');
                }
                // Never answers the first attempt, until Ky's timeout aborts it
                return new Promise((_resolve, reject) => {
                    request.signal.addEventListener('abort', () => {
                        reject(request.signal.reason as Error);
                    });
                });
            },
            timeout: 10,
            retry: { limit: 1, delay: () => 0, statusCodes: [503], retryOnTimeout: true },
        });

        const response = await send(new Request('http://example.test'));

        expect(response.status).to.equal(200);
        expect(await response.text()).to.equal('done');
        expect(sent.map(({ method }) => method)).to.deep.equal(['GET', 'GET']);
        expect(sent[0]!.signal.aborted).to.equal(true);
    });

    test('Rejects with the timeout at once for a POST without an Idempotency-Key', async () => {
        let attempts = 0;
        const send = kySend({
            fetch: async (input, init) => {
                attempts++;
                const { signal } = new Request(input, init);
                return new Promise((_resolve, reject) => {
                    signal.addEventListener('abort', () => {
                        reject(signal.reason as Error);
                    });
                });
            },
            timeout: 10,
            retry: { limit: 1, delay: () => 0, statusCodes: [503], retryOnTimeout: true },
        });

        await expect(
            send(new Request('http://example.test', { method: 'POST', body: 'note' }))
        ).to.be.rejectedWith(TimeoutError);
        expect(attempts).to.equal(1);
    });

    test('Rejects with an error Ky does not recognize at once', async () => {
        const failure = new Error('bug');
        const { send, sent } = withKy(async () => {
            throw failure;
        });

        await expect(send(new Request('http://example.test'))).to.be.rejectedWith(failure);
        expect(sent).to.have.length(1);
    });
});
