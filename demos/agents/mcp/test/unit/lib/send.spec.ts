import { setTimeout } from 'node:timers/promises';
import PQueue from 'p-queue';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { notesApiSend } from '#internal/lib/send.js';
import { listen } from '#test/helpers/serve.js';

suite('notesApiSend', () => {
    const withApi = beforeEach(async () => ({ api: await listen(), received: [] as string[] }));
    withApi.afterEach(async ({ api }) => {
        await api.close();
    });

    withApi.test(
        'Times only the send: attempts queued longer than the timeout still go once each',
        async ({ api, received }) => {
            api.use(request => {
                const { pathname } = new URL(request.url);
                received.push(pathname);
                return new Response('done');
            });
            const queue = new PQueue({ concurrency: 1 });
            const timeoutMs = 250;
            const send = notesApiSend({ queue, timeoutMs });
            // Something else holds the only slot, for longer than an attempt may take
            const held = Promise.withResolvers<void>();
            void queue.add(async () => held.promise);

            const responses = Promise.all(
                ['/a', '/b', '/c'].map(async path => send(new Request(`${api.url}${path}`)))
            );
            await setTimeout(timeoutMs * 2);
            held.resolve();

            const answered = await responses;
            expect(answered.map(({ status }) => status)).to.deep.equal([200, 200, 200]);
            expect(received.toSorted((a, b) => a.localeCompare(b))).to.deep.equal([
                '/a',
                '/b',
                '/c',
            ]);
        }
    );

    withApi.test('Sends again an attempt that takes too long', async ({ api, received }) => {
        api.use(async request => {
            received.push(request.method);
            if (received.length === 1) {
                // Never answers in time
                await new Promise(() => {});
            }
            return new Response('done');
        });
        const send = notesApiSend({ timeoutMs: 100 });

        const response = await send(new Request(api.url));

        expect(await response.text()).to.equal('done');
        expect(received).to.deep.equal(['GET', 'GET']);
    });
});
