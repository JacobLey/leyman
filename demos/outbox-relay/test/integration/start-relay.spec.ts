import type { StartRelayOptions } from '@leyman/demo-outbox-relay';
import { once } from 'node:events';
import { placeOrder, startRelay } from '@leyman/demo-outbox-relay';
import { expect } from '@leyman/expect';
import { suite } from 'mocha-chain';
import { aws, createBus, receiveEvents, subscribeQueue } from '#test/helpers/aws.js';
import { expireLeases, withDatabase } from '#test/helpers/database.js';
import { failOnce, holdFirst } from '#test/helpers/fake-event-bridge.js';

// Long enough that no test sees a poll unless it asks for one
const neverMs = 60 * 60 * 1000;

/**
 * Fails the run on an error no test expects, since a relay reports its errors nowhere else.
 *
 * @param error - What a drain threw
 */
const unexpected = (error: unknown): void => {
    queueMicrotask(() => {
        throw error;
    });
};

/**
 * Runs `body` with a relay running, closing it after, before the test's database goes away.
 *
 * @param options - For `startRelay`, polling never and failing on any error unless given
 * @param body - What to do while it runs
 */
const whileRelaying = async (
    options: Omit<StartRelayOptions, 'onError' | 'pollMs'> & Partial<StartRelayOptions>,
    body: () => Promise<void>
): Promise<void> => {
    await using relay = await startRelay({ onError: unexpected, pollMs: neverMs, ...options });
    await body();
    // Disposing closes it again if `body` throws; closing twice does nothing more
    await relay.close();
};

suite('startRelay', () => {
    const withBus = withDatabase().beforeEach(async () => {
        const busName = await createBus();
        return { busName, queueUrl: await subscribeQueue({ busName }) };
    });

    withBus.test(
        'Drains rows already pending when it starts, in batches of 10',
        async ({ pool, listener, busName, queueUrl }) => {
            await pool.query(
                `INSERT INTO outbox (source, detail_type, detail)
                SELECT 'shop.orders', 'OrderPlaced', '{}' FROM generate_series(1, 25)`
            );

            await whileRelaying(
                { pool, listener, busName, eventBridge: aws().eventBridge },
                async () => {
                    expect(await receiveEvents(queueUrl, 25)).to.have.length(25);
                }
            );
        }
    );

    withBus.test('Wakes on the doorbell', async ({ pool, listener, busName, queueUrl }) => {
        await whileRelaying(
            { pool, listener, busName, eventBridge: aws().eventBridge },
            async () => {
                await placeOrder(pool, { customer: 'ada', totalCents: 1200 });

                const [event] = await receiveEvents(queueUrl, 1);
                expect(event!.detail.outboxId).to.equal('1');
            }
        );
    });

    withBus.test('Polls when rings are lost', async ({ pool, listener, busName, queueUrl }) => {
        await whileRelaying(
            { pool, listener, busName, eventBridge: aws().eventBridge, pollMs: 10 },
            async () => {
                await listener.query('UNLISTEN outbox');
                await placeOrder(pool, { customer: 'ada', totalCents: 1200 });

                const [event] = await receiveEvents(queueUrl, 1);
                expect(event!.detail.outboxId).to.equal('1');
            }
        );
    });

    withBus.test(
        'Drains again after a ring during a drain',
        async ({ pool, listener, busName, queueUrl }) => {
            await placeOrder(pool, { customer: 'ada', totalCents: 1200 });
            const held = holdFirst(aws().eventBridge);

            await whileRelaying({ pool, listener, busName, eventBridge: held.client }, async () => {
                await held.started;
                // The relay's handler was added first, so it has seen the ring by the time this resolves
                const rung = once(listener, 'notification');
                await placeOrder(pool, { customer: 'grace', totalCents: 800 });
                await rung;
                held.release();

                const events = await receiveEvents(queueUrl, 2);
                expect(events.map(({ detail }) => detail.outboxId)).to.deep.equal(['1', '2']);
            });
        }
    );

    withBus.test(
        'Reports a failed drain, and keeps relaying',
        async ({ pool, listener, busName, queueUrl }) => {
            await placeOrder(pool, { customer: 'ada', totalCents: 1200 });
            const error = new Error('Network down');
            const reported = Promise.withResolvers<unknown>();

            await whileRelaying(
                {
                    pool,
                    listener,
                    busName,
                    eventBridge: failOnce(aws().eventBridge, error),
                    onError: reported.resolve,
                },
                async () => {
                    expect(await reported.promise).to.equal(error);
                    await expireLeases(pool);
                    await placeOrder(pool, { customer: 'grace', totalCents: 800 });

                    const events = await receiveEvents(queueUrl, 2);
                    expect(
                        events
                            .map(({ detail }) => detail.outboxId)
                            .toSorted((a, b) => a.localeCompare(b))
                    ).to.deep.equal(['1', '2']);
                }
            );
        }
    );
});
