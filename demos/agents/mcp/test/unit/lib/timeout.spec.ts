import type { Send } from '@leyman/demo-fetch-middleware';
import { isTimeoutError } from 'ky';
import sinon from 'sinon';
import { expect } from '@leyman/expect';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { attemptTimeout } from '#internal/lib/timeout.js';

/**
 * A send that never answers, and rejects with its request's abort reason once aborted, as `fetch` does.
 *
 * @param request - What it's sent
 * @returns Never resolves
 */
const hangingSend: Send = async request =>
    new Promise((_resolve, reject) => {
        request.signal.addEventListener('abort', () => {
            reject(request.signal.reason as Error);
        });
    });

suite('attemptTimeout', () => {
    // Only the timer it sets: streams and promises still run as they do
    const withClock = beforeEach(() => ({
        clock: sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }),
    }));
    afterEach(() => {
        sinon.restore();
    });

    withClock.test(
        "Rejects with Ky's TimeoutError, for the request, once the send takes too long",
        async ({ clock }) => {
            const timed = attemptTimeout(1000)(hangingSend);

            const sent = timed(new Request('http://example.test/slow'));
            const rejected = expect(sent).to.be.rejected;
            await clock.tickAsync(1000);

            const error: unknown = await rejected;
            expect(isTimeoutError(error)).to.equal(true);
            expect((error as { request: Request }).request.url).to.equal(
                'http://example.test/slow'
            );
        }
    );

    withClock.test(
        'Answers with a response that comes in time, and stops timing',
        async ({ clock }) => {
            const answer = Promise.withResolvers<Response>();
            let signal: AbortSignal | null = null;
            const timed = attemptTimeout(1000)(async request => {
                ({ signal } = request);
                return answer.promise;
            });

            const sent = timed(new Request('http://example.test'));
            await clock.tickAsync(999);
            answer.resolve(new Response('in time'));
            const response = await sent;

            expect(await response.text()).to.equal('in time');
            expect(clock.countTimers()).to.equal(0);
            expect(signal!.aborted).to.equal(false);
        }
    );

    withClock.test("Rejects with the caller's reason when the caller aborts", async ({ clock }) => {
        const controller = new AbortController();
        const reason = new Error('Cancelled');
        const timed = attemptTimeout(1000)(hangingSend);

        const sent = timed(new Request('http://example.test', { signal: controller.signal }));
        controller.abort(reason);

        await expect(sent).to.be.rejectedWith(reason);
        expect(clock.countTimers()).to.equal(0);
    });
});
