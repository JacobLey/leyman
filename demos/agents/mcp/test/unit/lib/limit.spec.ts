import type { Send } from '@leyman/demo-fetch-middleware';
import PQueue from 'p-queue';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { limitConcurrency } from '#internal/lib/limit.js';

/**
 * A send that answers each request only when the test says, so the test controls how long each holds its slot.
 *
 * @returns The send, the URL of each request it got, and how to settle the one at an index
 */
const heldSend = (): {
    readonly send: Send;
    readonly started: string[];
    readonly settle: (index: number, outcome: Error | Response) => void;
} => {
    const started: string[] = [];
    const pending: PromiseWithResolvers<Response>[] = [];
    return {
        started,
        send: async request => {
            started.push(request.url);
            const held = Promise.withResolvers<Response>();
            pending.push(held);
            return held.promise;
        },
        settle: (index, outcome) => {
            if (Error.isError(outcome)) {
                pending[index]!.reject(outcome);
            } else {
                pending[index]!.resolve(outcome);
            }
        },
    };
};

/**
 * Lets every pending promise settle, so a queued send that's going to start has.
 */
const settled = async (): Promise<void> => {
    await new Promise(resolve => {
        setImmediate(resolve);
    });
};

suite('limitConcurrency', () => {
    test('Starts no more sends at once than the queue has slots', async () => {
        const queue = new PQueue({ concurrency: 2 });
        const { send, started, settle } = heldSend();
        const limited = limitConcurrency(queue)(send);

        const responses = ['a', 'b', 'c'].map(async path =>
            limited(new Request(`http://example.test/${path}`))
        );
        await settled();

        expect(started).to.deep.equal(['http://example.test/a', 'http://example.test/b']);
        expect(queue.size).to.equal(1);

        settle(0, new Response('a'));
        settle(1, new Response('b'));
        await settled();
        settle(2, new Response('c'));

        const answered = await Promise.all(responses);
        expect(await Promise.all(answered.map(async response => response.text()))).to.deep.equal([
            'a',
            'b',
            'c',
        ]);
    });

    test('Frees the slot when the send answers', async () => {
        const queue = new PQueue({ concurrency: 1 });
        const { send, started, settle } = heldSend();
        const limited = limitConcurrency(queue)(send);

        const first = limited(new Request('http://example.test/first'));
        const second = limited(new Request('http://example.test/second'));
        await settled();
        expect(started).to.have.length(1);

        settle(0, new Response('first'));
        await settled();

        expect(started).to.have.length(2);
        settle(1, new Response('second'));
        const [firstResponse, secondResponse] = await Promise.all([first, second]);
        expect(await firstResponse.text()).to.equal('first');
        expect(await secondResponse.text()).to.equal('second');
    });

    test('Frees the slot when the send fails, rejecting with its error', async () => {
        const queue = new PQueue({ concurrency: 1 });
        const { send, started, settle } = heldSend();
        const limited = limitConcurrency(queue)(send);
        const failure = new TypeError('fetch failed');

        const first = limited(new Request('http://example.test/first'));
        const second = limited(new Request('http://example.test/second'));
        await settled();

        settle(0, failure);
        await expect(first).to.be.rejectedWith(failure);
        await settled();

        expect(started).to.have.length(2);
        settle(1, new Response('second'));
        const response = await second;
        expect(response.status).to.equal(200);
    });

    test('Frees the slot when a send is aborted, rejecting with the reason', async () => {
        const queue = new PQueue({ concurrency: 1 });
        const controller = new AbortController();
        const reason = new Error('Cancelled');
        // Rejects when its request is aborted, as `fetch` does
        const send: Send = async request =>
            new Promise((_resolve, reject) => {
                request.signal.addEventListener('abort', () => {
                    reject(request.signal.reason as Error);
                });
            });
        const limited = limitConcurrency(queue)(send);

        const first = limited(new Request('http://example.test', { signal: controller.signal }));
        await settled();
        controller.abort(reason);

        await expect(first).to.be.rejectedWith(reason);
        expect(queue.pending).to.equal(0);
    });

    test('Rejects a request aborted while it waits with the reason, never sending it', async () => {
        const queue = new PQueue({ concurrency: 1 });
        const { send, started, settle } = heldSend();
        const limited = limitConcurrency(queue)(send);
        const controller = new AbortController();
        const reason = new Error('Cancelled');

        const first = limited(new Request('http://example.test/first'));
        const waiting = limited(
            new Request('http://example.test/waiting', { signal: controller.signal })
        );
        await settled();
        expect(queue.size).to.equal(1);

        controller.abort(reason);

        await expect(waiting).to.be.rejectedWith(reason);
        expect(queue.size).to.equal(0);
        settle(0, new Response('first'));
        await first;
        await queue.onIdle();
        expect(started).to.deep.equal(['http://example.test/first']);
    });
});
