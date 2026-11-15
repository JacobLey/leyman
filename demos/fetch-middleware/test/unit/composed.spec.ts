import { setImmediate } from 'node:timers/promises';
import { bearer, compose, kySend } from '@leyman/demo-fetch-middleware';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

suite('bearer in front of kySend', () => {
    test('Reuses the token for retries, and renews once when it is refused', async () => {
        const sent: (string | null)[] = [];
        const renewed: string[] = [];
        const fetch = compose(
            [
                bearer({
                    token: async () => 'old',
                    renew: async refused => {
                        renewed.push(refused);
                        return 'new';
                    },
                }),
            ],
            kySend({
                fetch: async (input, init) => {
                    const { headers } = new Request(input, init);
                    const authorization = headers.get('authorization');
                    sent.push(authorization);
                    if (authorization === 'Bearer new') {
                        return new Response('done');
                    }
                    return new Response(null, { status: sent.length === 1 ? 503 : 401 });
                },
                retry: { limit: 2, delay: () => 0, statusCodes: [503] },
            })
        );

        const response = await fetch('http://example.test');

        expect(await response.text()).to.equal('done');
        expect(sent).to.deep.equal(['Bearer old', 'Bearer old', 'Bearer new']);
        expect(renewed).to.deep.equal(['old']);
    });

    test('Rejects with the abort reason while Ky waits to retry, and sends no more', async () => {
        const controller = new AbortController();
        const reason = new Error('Aborted');
        let attempts = 0;
        const fetch = compose(
            [bearer({ token: async () => 'token', renew: async () => null })],
            kySend({
                fetch: async () => {
                    attempts++;
                    return new Response('busy', { status: 503 });
                },
                // Longer than any test runs: the request only settles if the abort ends the wait
                retry: { limit: 1, delay: () => 2_147_483_647, statusCodes: [503] },
            })
        );

        const response = fetch('http://example.test', { signal: controller.signal });
        // Ky is waiting to retry once every pending promise has settled
        await setImmediate();
        controller.abort(reason);

        await expect(response).to.be.rejectedWith(reason);
        expect(attempts).to.equal(1);
    });
});
