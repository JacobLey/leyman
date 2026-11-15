import type { Middleware } from '@leyman/demo-fetch-middleware';
import { compose } from '@leyman/demo-fetch-middleware';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

suite('compose', () => {
    test('Sends each request through the middlewares, the first outermost', async () => {
        const order: string[] = [];
        const named =
            (name: string): Middleware =>
            inner =>
            async request => {
                order.push(`${name} in`);
                const response = await inner(request);
                order.push(`${name} out`);
                return response;
            };
        const fetch = compose([named('first'), named('second')], async request => {
            order.push(`send ${request.method} ${request.url}`);
            return new Response('sent');
        });

        const response = await fetch('http://example.test/notes', { method: 'POST' });

        expect(await response.text()).to.equal('sent');
        expect(order).to.deep.equal([
            'first in',
            'second in',
            'send POST http://example.test/notes',
            'second out',
            'first out',
        ]);
    });

    test('Sends with fetch when given nothing else to send with', async () => {
        const fetch = compose([]);

        // Nothing listens here
        await expect(fetch('http://127.0.0.1:1')).to.be.rejectedWith(TypeError);
    });
});
