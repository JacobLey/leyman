import type { IdempotencyNotifier } from 'idempotency-keys';
import { setTimeout } from 'node:timers/promises';
import { expect } from '@leyman/expect';
import { computeFingerprint, IdempotencyKeys, ValkeyStore } from 'idempotency-keys';
import { beforeEach, suite } from 'mocha-chain';
import { attemptOf } from '../helpers/scenario.js';
import { bufferConnection, closeValkey, valkeyContext } from '../helpers/valkey.js';

const encoder = new TextEncoder();

const response = {
    status: 201,
    headers: [['Content-Type', 'text/plain']],
    body: encoder.encode('ok'),
} as const;

const request = { scope: 'user_1', operation: 'createNote', key: 'k1' };

/**
 * A notifier that loses every message, as one that is down would.
 */
const lossyNotifier: IdempotencyNotifier = {
    publish: async () => {},
    subscribe: () => () => {},
};

suite('IdempotencyKeys', () => {
    const withStore = beforeEach(valkeyContext).beforeEach(async ({ valkey, prefix }) => ({
        store: new ValkeyStore({ connection: bufferConnection(valkey), prefix }),
        fingerprint: await computeFingerprint({
            method: 'POST',
            target: '/notes',
            headers: [],
            named: [],
            body: '',
        }),
    }));
    withStore.afterEach(closeValkey);

    withStore.test(
        'Replays to a waiting request by polling, when notifications are lost',
        async ({ store, fingerprint }) => {
            const keys = new IdempotencyKeys({ store, notifier: lossyNotifier, waitMs: 5000 });
            const first = attemptOf(await keys.begin({ ...request, fingerprint }));
            const waiting = keys.begin({ ...request, fingerprint });
            // Long enough for the poll interval to have grown
            await setTimeout(400);
            await first.respond(response);
            expect(await waiting).to.have.property('outcome', 'replay');
        }
    );

    withStore.test('Stores header names in lower case', async ({ store, fingerprint }) => {
        const keys = new IdempotencyKeys({ store });
        const first = attemptOf(await keys.begin({ ...request, fingerprint }));
        await first.respond(response);
        expect(await keys.begin({ ...request, fingerprint }))
            .to.have.nested.property('response.headers')
            .that.deep.equals([['content-type', 'text/plain']]);
    });

    withStore.test(
        'Stores no header a server recomputes for each response',
        async ({ store, fingerprint }) => {
            const keys = new IdempotencyKeys({ store });
            const first = attemptOf(await keys.begin({ ...request, fingerprint }));
            await first.respond({
                ...response,
                headers: [
                    ['Content-Length', '2'],
                    ['Transfer-Encoding', 'chunked'],
                    ['Connection', 'keep-alive'],
                    ['Keep-Alive', 'timeout=5'],
                    ['Idempotent-Replayed', 'true'],
                    ['ETag', '"1"'],
                ],
            });
            expect(await keys.begin({ ...request, fingerprint }))
                .to.have.nested.property('response.headers')
                .that.deep.equals([['etag', '"1"']]);
        }
    );

    for (const status of [1.5, 600]) {
        withStore.test(
            `Refuses a status of ${status}, keeping the key`,
            async ({ store, fingerprint }) => {
                const keys = new IdempotencyKeys({ store, waitMs: 0 });
                const first = attemptOf(await keys.begin({ ...request, fingerprint }));
                expect(await first.respond({ ...response, status })).to.equal('refused');
                expect(await keys.begin({ ...request, fingerprint })).to.have.property(
                    'outcome',
                    'conflict'
                );
            }
        );
    }

    withStore.test('Releases nothing once stored', async ({ store, fingerprint }) => {
        const keys = new IdempotencyKeys({ store });
        const first = attemptOf(await keys.begin({ ...request, fingerprint }));
        await first.respond(response);
        expect(await first.release()).to.equal(false);
    });

    withStore.test(
        'Still stores the response when announcing it fails, and says why',
        async ({ store, fingerprint }) => {
            const failure = new Error('Notifier is down');
            const errors: unknown[][] = [];
            const keys = new IdempotencyKeys({
                store,
                notifier: {
                    ...lossyNotifier,
                    publish: async () => {
                        throw failure;
                    },
                },
                onError: (...args) => {
                    errors.push(args);
                },
            });
            const first = attemptOf(await keys.begin({ ...request, fingerprint }));
            expect(await first.respond(response)).to.equal('stored');
            expect(errors).to.deep.equal([[failure, first.identity]]);
        }
    );

    withStore.test('Ignores a failed announcement by default', async ({ store, fingerprint }) => {
        const keys = new IdempotencyKeys({
            store,
            notifier: {
                ...lossyNotifier,
                publish: async () => {
                    throw new Error('Notifier is down');
                },
            },
        });
        const first = attemptOf(await keys.begin({ ...request, fingerprint }));
        expect(await first.release()).to.equal(true);
    });

    withStore.test('Releases by a policy of its own', async ({ store, fingerprint }) => {
        const keys = new IdempotencyKeys({
            store,
            respondPolicy: ({ status }) => (status >= 500 ? 'release' : 'complete'),
        });
        const first = attemptOf(await keys.begin({ ...request, fingerprint }));
        expect(await first.respond({ ...response, status: 503 })).to.equal('released');
        expect(await keys.begin({ ...request, fingerprint })).to.have.property('outcome', 'run');
    });

    withStore.test(
        'Answers lost when a released response comes after a takeover',
        async ({ store, fingerprint }) => {
            const keys = new IdempotencyKeys({ store, leaseMs: 100, waitMs: 0 });
            const crashed = attemptOf(await keys.begin({ ...request, fingerprint }));
            await setTimeout(200);
            attemptOf(await keys.begin({ ...request, fingerprint }));
            expect(await crashed.respond({ ...response, status: 429 })).to.equal('lost');
        }
    );

    withStore.test(
        'Fails rather than run unprotected when the store fails, and stops listening',
        async ({ fingerprint }) => {
            const failure = new Error('Store is down');
            let subscriptions = 0;
            const keys = new IdempotencyKeys({
                notifier: {
                    publish: async () => {},
                    subscribe: () => {
                        subscriptions++;
                        return () => {
                            subscriptions--;
                        };
                    },
                },
                store: {
                    claim: async () => {
                        throw failure;
                    },
                    complete: async () => {
                        throw failure;
                    },
                    release: async () => {
                        throw failure;
                    },
                },
            });
            await expect(keys.begin({ ...request, fingerprint })).to.be.rejectedWith(failure);
            expect(subscriptions).to.equal(0);
        }
    );
});
