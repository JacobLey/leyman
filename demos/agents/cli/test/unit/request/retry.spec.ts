import type { Send } from '#internal/lib/request/compose.js';
import { ConstantBackoff } from 'cockatiel';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { compose } from '#internal/lib/request/compose.js';
import { retry } from '#internal/lib/request/retry.js';

const noWait = new ConstantBackoff(0);
// Waiting this long would fail the test: a response that says how long to wait is waited for instead
const tooLong = new ConstantBackoff(60_000);

/**
 * A send that answers with each response in turn, and records what it was sent.
 *
 * @param responses - What to answer, a function per send
 * @returns The send, and the requests (with their bodies read) it was sent
 */
const answering = (
    ...responses: (() => Response)[]
): { send: Send; sent: { method: string; body: string }[] } => {
    const sent: { method: string; body: string }[] = [];
    return {
        sent,
        send: async request => {
            sent.push({ method: request.method, body: await request.text() });
            const response = responses[sent.length - 1];
            if (!response) {
                throw new Error('Sent too many times');
            }
            return response();
        },
    };
};

const status =
    (code: number, headers: HeadersInit = {}): (() => Response) =>
    () =>
        new Response(null, { status: code, headers });

suite('retry', () => {
    test('Sends again when the response is 503, until one succeeds', async () => {
        const { send, sent } = answering(status(503), status(200));
        const fetch = compose([retry({ backoff: noWait })], send);

        const response = await fetch('http://example.test');

        expect(response.status).to.equal(200);
        expect(sent).to.have.length(2);
    });

    for (const code of [429, 502, 503, 504]) {
        test(`Retries status ${code} by default`, async () => {
            const { send, sent } = answering(status(code), status(200));
            const fetch = compose([retry({ backoff: noWait })], send);

            const response = await fetch('http://example.test');
            expect(response.status).to.equal(200);
            expect(sent).to.have.length(2);
        });
    }

    test('Returns other failures as they are', async () => {
        const { send, sent } = answering(status(500));
        const fetch = compose([retry({ backoff: noWait })], send);

        const response = await fetch('http://example.test');
        expect(response.status).to.equal(500);
        expect(sent).to.have.length(1);
    });

    test('Returns the last response after three sends by default', async () => {
        const { send, sent } = answering(status(503), status(503), status(504));
        const fetch = compose([retry({ backoff: noWait })], send);

        const response = await fetch('http://example.test');
        expect(response.status).to.equal(504);
        expect(sent).to.have.length(3);
    });

    test('Sends at most maxAttempts times, the first included', async () => {
        const { send, sent } = answering(status(503));
        const fetch = compose([retry({ backoff: noWait, maxAttempts: 1 })], send);

        const response = await fetch('http://example.test');
        expect(response.status).to.equal(503);
        expect(sent).to.have.length(1);
    });

    test('Retries only the statuses it is given', async () => {
        const { send, sent } = answering(status(500), status(503));
        const fetch = compose([retry({ backoff: noWait, statuses: new Set([500]) })], send);

        const response = await fetch('http://example.test');
        expect(response.status).to.equal(503);
        expect(sent).to.have.length(2);
    });

    test('Sends a POST once', async () => {
        const { send, sent } = answering(status(503));
        const fetch = compose([retry({ backoff: noWait })], send);

        const response = await fetch('http://example.test', { method: 'POST', body: 'note' });

        expect(response.status).to.equal(503);
        expect(sent).to.deep.equal([{ method: 'POST', body: 'note' }]);
    });

    test('Retries a POST with an Idempotency-Key, sending its body each time', async () => {
        const { send, sent } = answering(status(503), status(201));
        const fetch = compose([retry({ backoff: noWait })], send);

        const response = await fetch('http://example.test', {
            method: 'POST',
            headers: { 'Idempotency-Key': 'key' },
            body: 'note',
        });

        expect(response.status).to.equal(201);
        expect(sent).to.deep.equal([
            { method: 'POST', body: 'note' },
            { method: 'POST', body: 'note' },
        ]);
    });

    test('Retries a PUT, sending its body each time', async () => {
        const { send, sent } = answering(status(502), status(200));
        const fetch = compose([retry({ backoff: noWait })], send);

        await fetch('http://example.test', { method: 'PUT', body: 'note' });

        expect(sent).to.deep.equal([
            { method: 'PUT', body: 'note' },
            { method: 'PUT', body: 'note' },
        ]);
    });

    test('Sends again when the network fails, and rejects with its error once out of attempts', async () => {
        let sends = 0;
        const fetch = compose([retry({ backoff: noWait })], async request => {
            sends++;
            return globalThis.fetch(request);
        });

        // Nothing listens here
        await expect(fetch('http://127.0.0.1:1'))
            .to.be.rejectedWith(TypeError)
            .and.eventually.have.property('cause');
        expect(sends).to.equal(3);
    });

    test('Rejects at once with an error that is not the network’s', async () => {
        let sends = 0;
        const fetch = compose([retry({ backoff: noWait })], async () => {
            sends++;
            throw new TypeError('Not the network');
        });

        await expect(fetch('http://example.test')).to.be.rejectedWith(TypeError, 'Not the network');
        expect(sends).to.equal(1);
    });

    test('Waits as long as Retry-After says in seconds, rather than the backoff', async () => {
        const { send, sent } = answering(
            status(503, { 'Retry-After': '0' }),
            status(429, { 'Retry-After': '0' }),
            status(200)
        );
        const fetch = compose([retry({ backoff: tooLong })], send);

        const response = await fetch('http://example.test');
        expect(response.status).to.equal(200);
        expect(sent).to.have.length(3);
    });

    test('Waits until the date Retry-After says, rather than the backoff', async () => {
        const { send, sent } = answering(
            status(503, { 'Retry-After': 'Thu, 01 Jan 1970 00:00:00 GMT' }),
            status(200)
        );
        const fetch = compose([retry({ backoff: tooLong })], send);

        const response = await fetch('http://example.test');
        expect(response.status).to.equal(200);
        expect(sent).to.have.length(2);
    });

    test('Waits the backoff when Retry-After is neither seconds nor a date', async () => {
        const { send, sent } = answering(status(503, { 'Retry-After': 'soon' }), status(200));
        const fetch = compose([retry({ backoff: noWait })], send);

        const response = await fetch('http://example.test');
        expect(response.status).to.equal(200);
        expect(sent).to.have.length(2);
    });

    test('Returns a response whose Retry-After asks to wait longer than maxRetryAfterMs', async () => {
        const { send, sent } = answering(status(503, { 'Retry-After': '1' }));
        const fetch = compose([retry({ backoff: noWait, maxRetryAfterMs: 0 })], send);

        const response = await fetch('http://example.test');
        expect(response.status).to.equal(503);
        expect(sent).to.have.length(1);
    });

    test('Cancels the body of each response it retries, but not the one it returns', async () => {
        const cancelled: string[] = [];
        const withBody = (name: string, code: number) => () =>
            new Response(
                new ReadableStream({
                    cancel: () => {
                        cancelled.push(name);
                    },
                }),
                { status: code }
            );
        const { send } = answering(
            withBody('first', 503),
            withBody('second', 503),
            withBody('last', 200)
        );
        const fetch = compose([retry({ backoff: noWait })], send);

        const response = await fetch('http://example.test');

        expect(cancelled).to.deep.equal(['first', 'second']);
        expect(response.bodyUsed).to.equal(false);
        await response.body!.cancel();
    });
});
