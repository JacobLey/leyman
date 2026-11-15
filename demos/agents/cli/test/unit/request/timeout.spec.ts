import type { Send } from '#internal/lib/request/compose.js';
import { once } from 'node:events';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { compose } from '#internal/lib/request/compose.js';
import { timeout } from '#internal/lib/request/timeout.js';

/**
 * A send that never answers, and rejects with its signal's reason once aborted.
 *
 * @param request - What is sent
 * @returns Never a response
 * @rejects {Error} With the signal's reason, once aborted
 */
const hang: Send = async request => {
    await once(request.signal, 'abort');
    throw request.signal.reason as Error;
};

suite('timeout', () => {
    test('Aborts a send that takes longer than the timeout with a TimeoutError', async () => {
        const fetch = compose([timeout(0)], hang);

        await expect(fetch('http://example.test')).to.be.rejected.and.eventually.have.property(
            'name',
            'TimeoutError'
        );
    });

    test('Rejects with the reason of the request’s own signal when it aborts first', async () => {
        const fetch = compose([timeout(60_000)], hang);
        const controller = new AbortController();
        const reason = new Error('Stopped');

        const sent = fetch('http://example.test', { signal: controller.signal });
        controller.abort(reason);

        await expect(sent).to.be.rejectedWith(reason);
    });

    test('Returns the response of a send that answers in time', async () => {
        const fetch = compose([timeout(60_000)], async () => new Response('answered'));

        const response = await fetch('http://example.test');

        expect(await response.text()).to.equal('answered');
    });
});
