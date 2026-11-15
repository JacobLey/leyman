import type { Send } from '@leyman/demo-fetch-middleware';
import { setImmediate } from 'node:timers/promises';
import { bearer, compose } from '@leyman/demo-fetch-middleware';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

/**
 * A send that refuses some tokens, and records what it was sent.
 *
 * @param refused - The tokens it refuses, and with which status
 * @returns The send, and the authorization and body of each request it was sent
 */
const api = (
    refused: Readonly<Record<string, number>>
): { send: Send; sent: { authorization: string | null; body: string }[] } => {
    const sent: { authorization: string | null; body: string }[] = [];
    return {
        sent,
        send: async request => {
            const authorization = request.headers.get('authorization');
            sent.push({ authorization, body: await request.text() });
            const token = authorization?.replace('Bearer ', '') ?? '';
            return new Response(`answered ${token}`, { status: refused[token] ?? 200 });
        },
    };
};

suite('bearer', () => {
    test('Sends the token as a bearer token, in place of any authorization the request had', async () => {
        const { send, sent } = api({});
        const renewed: string[] = [];
        const fetch = compose(
            [
                bearer({
                    token: async () => 'token',
                    renew: async refused => {
                        renewed.push(refused);
                        return null;
                    },
                }),
            ],
            send
        );

        const response = await fetch('http://example.test', {
            headers: { Authorization: 'Basic other' },
        });

        expect(await response.text()).to.equal('answered token');
        expect(sent).to.deep.equal([{ authorization: 'Bearer token', body: '' }]);
        expect(renewed).to.deep.equal([]);
    });

    test('Sends the request again, body and all, with the token renewed after a 401', async () => {
        const { send, sent } = api({ old: 401 });
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
            send
        );

        const response = await fetch('http://example.test', { method: 'POST', body: 'note' });

        expect(await response.text()).to.equal('answered new');
        expect(renewed).to.deep.equal(['old']);
        expect(sent).to.deep.equal([
            { authorization: 'Bearer old', body: 'note' },
            { authorization: 'Bearer new', body: 'note' },
        ]);
    });

    test('Cancels the body of the refusal it sends again for', async () => {
        let wasCancelled = false;
        const fetch = compose(
            [bearer({ token: async () => 'old', renew: async () => 'new' })],
            async request =>
                request.headers.get('authorization') === 'Bearer old'
                    ? new Response(
                          new ReadableStream({
                              cancel: () => {
                                  wasCancelled = true;
                              },
                          }),
                          { status: 401 }
                      )
                    : new Response(null, { status: 204 })
        );

        const response = await fetch('http://example.test');
        expect(response.status).to.equal(204);
        expect(wasCancelled).to.equal(true);
    });

    test('Sends again after a refusal with no body', async () => {
        const fetch = compose(
            [bearer({ token: async () => 'old', renew: async () => 'new' })],
            async request =>
                new Response(null, {
                    status: request.headers.get('authorization') === 'Bearer old' ? 401 : 204,
                })
        );

        const response = await fetch('http://example.test');
        expect(response.status).to.equal(204);
    });

    test('Returns the refusal when there is no token to renew it with', async () => {
        const { send, sent } = api({ old: 401 });
        const fetch = compose(
            [bearer({ token: async () => 'old', renew: async () => null })],
            send
        );

        const response = await fetch('http://example.test');

        expect(response.status).to.equal(401);
        expect(await response.text()).to.equal('answered old');
        expect(sent).to.have.length(1);
    });

    test('Renews the token only for the refused statuses it is given', async () => {
        const { send, sent } = api({ old: 403, other: 401 });
        const renewed: string[] = [];
        let token = 'old';
        const fetch = compose(
            [
                bearer(
                    {
                        token: async () => token,
                        renew: async refused => {
                            renewed.push(refused);
                            return 'new';
                        },
                    },
                    { refusedStatuses: new Set([403]) }
                ),
            ],
            send
        );

        const renewedResponse = await fetch('http://example.test');
        token = 'other';
        const refusedResponse = await fetch('http://example.test');

        expect(renewedResponse.status).to.equal(200);
        expect(refusedResponse.status).to.equal(401);

        expect(renewed).to.deep.equal(['old']);
        expect(sent.map(({ authorization }) => authorization)).to.deep.equal([
            'Bearer old',
            'Bearer new',
            'Bearer other',
        ]);
    });

    test('Renews once for requests refused the same token at the same time', async () => {
        const { send, sent } = api({ old: 401 });
        const gate = Promise.withResolvers<undefined>();
        let renewals = 0;
        const fetch = compose(
            [
                bearer({
                    token: async () => 'old',
                    renew: async () => {
                        renewals++;
                        await gate.promise;
                        return 'new';
                    },
                }),
            ],
            send
        );

        const responses = Promise.all([fetch('http://example.test'), fetch('http://example.test')]);
        // Both are refused, and wait for a renewal, once every pending promise has settled
        await setImmediate();
        gate.resolve(undefined);

        const [first, second] = await responses;
        expect([first.status, second.status]).to.deep.equal([200, 200]);
        expect(renewals).to.equal(1);
        expect(
            sent
                .map(({ authorization }) => authorization ?? '')
                .toSorted((a, b) => a.localeCompare(b))
        ).to.deep.equal(['Bearer new', 'Bearer new', 'Bearer old', 'Bearer old']);
    });

    test('Renews again for a refusal after the last renewal settled, even when it failed', async () => {
        const { send } = api({ old: 401 });
        let renewals = 0;
        const fetch = compose(
            [
                bearer({
                    token: async () => 'old',
                    renew: async () => {
                        renewals++;
                        if (renewals === 1) {
                            throw new Error('Renewal failed');
                        }
                        return 'new';
                    },
                }),
            ],
            send
        );

        await expect(fetch('http://example.test')).to.be.rejectedWith('Renewal failed');
        const response = await fetch('http://example.test');
        expect(response.status).to.equal(200);
        expect(renewals).to.equal(2);
    });
});
