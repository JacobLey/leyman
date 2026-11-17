import type { Pool } from 'pg';
import { placeOrder, relayOnce } from '@leyman/demo-outbox-relay';
import { expect } from '@leyman/expect';
import { suite } from 'mocha-chain';
import { aws, createBus, queueDepth, receiveEvents, subscribeQueue } from '#test/helpers/aws.js';
import { expireLeases, outboxRows, withDatabase } from '#test/helpers/database.js';
import { sendThenFail, throttleAll, throttleFirst } from '#test/helpers/fake-event-bridge.js';

/**
 * Writes `count` outbox rows in one statement, as another service sharing the outbox might.
 *
 * @param pool - Test database
 * @param count - How many
 */
const insertEvents = async (pool: Pool, count: number): Promise<void> => {
    await pool.query(
        `INSERT INTO outbox (source, detail_type, detail)
        SELECT 'shop.orders', 'OrderPlaced', jsonb_build_object('n', n) FROM generate_series(1, $1) AS n`,
        [count]
    );
};

suite('relayOnce', () => {
    const withBus = withDatabase().beforeEach(async () => {
        const busName = await createBus();
        return { busName, queueUrl: await subscribeQueue({ busName }) };
    });

    withBus.test(
        'Sends a committed order with its outbox id',
        async ({ pool, busName, queueUrl }) => {
            const orderId = await placeOrder(pool, { customer: 'ada', totalCents: 1200 });

            const result = await relayOnce({ pool, busName, eventBridge: aws().eventBridge });

            expect(result).to.deep.equal({ sent: ['1'], retried: [], parked: [] });
            const [event] = await receiveEvents(queueUrl, 1);
            expect(event).to.deep.include({ source: 'shop.orders', 'detail-type': 'OrderPlaced' });
            expect(event!.detail).to.deep.equal({
                orderId,
                customer: 'ada',
                totalCents: 1200,
                outboxId: '1',
            });
            expect(await outboxRows(pool)).to.deep.equal([
                { id: '1', attempts: 1, sent: true, failed: false, lastError: null },
            ]);
        }
    );

    withBus.test('Sends nothing for an order that rolls back', async ({ pool, busName }) => {
        await expect(placeOrder(pool, { customer: 'ada', totalCents: -1 })).to.be.rejectedWith(
            'violates check constraint'
        );

        expect(await relayOnce({ pool, busName, eventBridge: aws().eventBridge })).to.deep.equal({
            sent: [],
            retried: [],
            parked: [],
        });
        expect(await outboxRows(pool)).to.deep.equal([]);
    });

    // The dual write the outbox avoids: the event goes out when the call runs, not when the transaction commits
    withBus.test(
        'Publishing inside the transaction sends an event for an order that never commits',
        async ({ pool, busName, queueUrl }) => {
            const client = await pool.connect();
            await client.query('BEGIN');
            await aws().eventBridge.putEvents({
                Entries: [
                    {
                        EventBusName: busName,
                        Source: 'shop.orders',
                        DetailType: 'OrderPlaced',
                        Detail: JSON.stringify({ customer: 'ada', totalCents: -1 }),
                    },
                ],
            });
            await expect(
                client.query("INSERT INTO orders (customer, total_cents) VALUES ('ada', -1)")
            ).to.be.rejectedWith('violates check constraint');
            await client.query('ROLLBACK');
            client.release();

            expect(await receiveEvents(queueUrl, 1)).to.have.length(1);
            const { rows } = await pool.query('SELECT id FROM orders');
            expect(rows).to.deep.equal([]);
        }
    );

    withBus.test(
        'Parks entries EventBridge refuses, and sends the rest',
        async ({ pool, busName, queueUrl }) => {
            await pool.query(
                `INSERT INTO outbox (source, detail_type, detail) VALUES
            ('shop.orders', 'OrderPlaced', '{"orderId":"1"}'),
            ('aws.orders', 'OrderPlaced', '{"orderId":"2"}'),
            ('shop.orders', 'OrderPlaced', '[1]')`
            );

            const result = await relayOnce({ pool, busName, eventBridge: aws().eventBridge });

            expect(result).to.deep.equal({ sent: ['1'], retried: [], parked: ['2', '3'] });
            expect(await outboxRows(pool)).to.deep.equal([
                { id: '1', attempts: 1, sent: true, failed: false, lastError: null },
                {
                    id: '2',
                    attempts: 1,
                    sent: false,
                    failed: true,
                    lastError: 'NotAuthorizedForSourceException',
                },
                { id: '3', attempts: 1, sent: false, failed: true, lastError: 'MalformedDetail' },
            ]);
            const [event] = await receiveEvents(queueUrl, 1);
            expect(event!.detail.outboxId).to.equal('1');
        }
    );

    suite('Size caps', () => {
        // `{"pad": "…"}` as jsonb text: 11 bytes around the padding
        const insertPadded = async (pool: Pool, detailBytes: number, count = 1): Promise<void> => {
            await pool.query(
                `INSERT INTO outbox (source, detail_type, detail)
                SELECT 'shop.orders', repeat('d', 128), jsonb_build_object('pad', repeat('x', $1))
                FROM generate_series(1, $2)`,
                [detailBytes - 11, count]
            );
        };

        withBus.test(
            'Sends 10 rows at the caps in one request',
            async ({ pool, busName, queueUrl }) => {
                await insertPadded(pool, 100_000, 10);

                const result = await relayOnce({ pool, busName, eventBridge: aws().eventBridge });

                expect(result.sent).to.have.length(10);
                expect(await receiveEvents(queueUrl, 10)).to.have.length(10);
            }
        );

        withBus.test('Refuses a detail over 100 000 bytes', async ({ pool }) => {
            await expect(insertPadded(pool, 100_001)).to.be.rejectedWith(
                'violates check constraint'
            );
        });

        withBus.test(
            'Refuses a source over 256 bytes, and a detail type over 128 characters',
            async ({ pool }) => {
                await expect(
                    pool.query(
                        "INSERT INTO outbox (source, detail_type, detail) VALUES (repeat('s', 257), 'OrderPlaced', '{}')"
                    )
                ).to.be.rejectedWith('violates check constraint');
                await expect(
                    pool.query(
                        "INSERT INTO outbox (source, detail_type, detail) VALUES ('shop.orders', repeat('d', 129), '{}')"
                    )
                ).to.be.rejectedWith('violates check constraint');
            }
        );

        // What the caps prevent: EventBridge refuses the whole request, so no entry gets a result to record
        // https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-putevent-size.html
        withBus.test('EventBridge refuses a request over 1 MiB as a whole', async ({ busName }) => {
            const entry = {
                EventBusName: busName,
                Source: 'shop.orders',
                DetailType: 'OrderPlaced',
                Detail: JSON.stringify({ pad: 'x'.repeat(250_000) }),
            };
            await expect(
                aws().eventBridge.putEvents({ Entries: Array.from({ length: 5 }, () => entry) })
            ).to.be.rejected;
        });
    });

    withBus.test('Never claims a parked row again', async ({ pool, busName }) => {
        await pool.query(
            "INSERT INTO outbox (source, detail_type, detail) VALUES ('aws.orders', 'OrderPlaced', '{}')"
        );
        await relayOnce({ pool, busName, eventBridge: aws().eventBridge });
        await expireLeases(pool);

        expect(await relayOnce({ pool, busName, eventBridge: aws().eventBridge })).to.deep.equal({
            sent: [],
            retried: [],
            parked: [],
        });
    });

    withBus.test(
        'Retries an entry failing with a retryable code once its delay passes',
        async ({ pool, busName, queueUrl }) => {
            await insertEvents(pool, 2);

            const first = await relayOnce({
                pool,
                busName,
                eventBridge: throttleFirst(aws().eventBridge),
            });
            const tooSoon = await relayOnce({ pool, busName, eventBridge: aws().eventBridge });
            await expireLeases(pool);
            const retry = await relayOnce({ pool, busName, eventBridge: aws().eventBridge });

            expect([first, tooSoon, retry]).to.deep.equal([
                { sent: ['2'], retried: ['1'], parked: [] },
                { sent: [], retried: [], parked: [] },
                { sent: ['1'], retried: [], parked: [] },
            ]);
            const events = await receiveEvents(queueUrl, 2);
            expect(events.map(({ detail }) => detail.outboxId)).to.deep.equal(['2', '1']);
        }
    );

    withBus.test('Parks a retryable failure after maxAttempts', async ({ pool, busName }) => {
        await insertEvents(pool, 1);

        const result = await relayOnce({
            pool,
            busName,
            eventBridge: throttleAll(),
            maxAttempts: 1,
        });

        expect(result).to.deep.equal({ sent: [], retried: [], parked: ['1'] });
        expect(await outboxRows(pool)).to.deep.equal([
            { id: '1', attempts: 1, sent: false, failed: true, lastError: 'ThrottlingException' },
        ]);
    });

    suite('Sends a row again when the relay dies after sending', () => {
        const withFifo = withBus.beforeEach(async ({ busName }) => ({
            fifoQueueUrl: await subscribeQueue({ busName, fifo: true }),
        }));

        withFifo.test(
            'Leaves the row leased until the lease expires',
            async ({ pool, busName }) => {
                await insertEvents(pool, 1);
                await expect(
                    relayOnce({ pool, busName, eventBridge: sendThenFail(aws().eventBridge) })
                ).to.be.rejectedWith('Connection reset');

                expect(
                    await relayOnce({ pool, busName, eventBridge: aws().eventBridge })
                ).to.deep.equal({
                    sent: [],
                    retried: [],
                    parked: [],
                });
            }
        );

        withFifo.test(
            'Delivers it twice with the same outbox id, which FIFO deduplication does not catch',
            async ({ pool, busName, queueUrl, fifoQueueUrl }) => {
                await insertEvents(pool, 1);
                await expect(
                    relayOnce({ pool, busName, eventBridge: sendThenFail(aws().eventBridge) })
                ).to.be.rejectedWith('Connection reset');
                await expireLeases(pool);
                await relayOnce({ pool, busName, eventBridge: aws().eventBridge });

                const [standard, fifo] = await Promise.all([
                    receiveEvents(queueUrl, 2),
                    receiveEvents(fifoQueueUrl, 2),
                ]);
                expect(standard.map(({ detail }) => detail.outboxId)).to.deep.equal(['1', '1']);
                expect(fifo.map(({ detail }) => detail.outboxId)).to.deep.equal(['1', '1']);
                // EventBridge stamps a new id on each call, which is why content-based deduplication sees two bodies
                expect(fifo[0]!.id).not.to.equal(fifo[1]!.id);
            }
        );
    });

    withBus.test(
        'Claims each row once across concurrent relays',
        async ({ pool, busName, queueUrl }) => {
            await insertEvents(pool, 25);
            const relay = async (): Promise<string[]> => {
                const first = await relayOnce({ pool, busName, eventBridge: aws().eventBridge });
                const second = await relayOnce({ pool, busName, eventBridge: aws().eventBridge });
                return [...first.sent, ...second.sent];
            };

            const relayed = await Promise.all([relay(), relay()]);
            const sent = relayed.flat();

            const ids = Array.from({ length: 25 }, (_, i) => String(i + 1));
            expect(sent.toSorted((a, b) => Number(a) - Number(b))).to.deep.equal(ids);
            const rows = await outboxRows(pool);
            expect(rows.map(({ attempts }) => attempts)).to.deep.equal(ids.map(() => 1));
            const events = await receiveEvents(queueUrl, 25);
            const outboxIds = events.map(({ detail }) => detail.outboxId);
            expect(outboxIds.toSorted((a, b) => Number(a) - Number(b))).to.deep.equal(ids);
        }
    );

    withBus.test(
        'Reports an event sent when the queue policy is missing, though it is dropped',
        async ({ pool, busName, queueUrl }) => {
            const unpermitted = await subscribeQueue({ busName, policy: false });
            await placeOrder(pool, { customer: 'ada', totalCents: 1200 });

            const result = await relayOnce({ pool, busName, eventBridge: aws().eventBridge });

            expect(result.sent).to.deep.equal(['1']);
            // The queue with a policy, on the same bus, shows the event was delivered
            expect(await receiveEvents(queueUrl, 1)).to.have.length(1);
            expect(await queueDepth(unpermitted)).to.equal(0);
        }
    );

    withBus.test('Reports an event sent to a bus that does not exist', async ({ pool }) => {
        await placeOrder(pool, { customer: 'ada', totalCents: 1200 });

        const result = await relayOnce({
            busName: 'no-such-bus',
            eventBridge: aws().eventBridge,
            pool,
        });

        expect(result.sent).to.deep.equal(['1']);
    });
});
