import { once } from 'node:events';
import pDefer from 'p-defer';
import { Client } from 'pg';
import { expect } from '@leyman/expect';
import { IdempotencyKeysOptionError } from 'idempotency-keys';
import { PostgresNotifier } from 'idempotency-keys/postgres';
import { ValkeyNotifier } from 'idempotency-keys/valkey';
import { beforeEach, suite } from 'mocha-chain';
import { withDatabase } from '#test/helpers/database.js';
import { closeValkey, connectValkey, valkeyContext } from '#test/helpers/valkey.js';

const identity = 'a'.repeat(64);
const otherIdentity = 'b'.repeat(64);

/**
 * A listener that counts its calls, and resolves `called` on the first.
 *
 * @returns Listener and its calls
 */
const counter = (): { listener: () => void; calls: () => number; called: Promise<void> } => {
    const first = pDefer<void>();
    let calls = 0;
    return {
        listener: () => {
            calls++;
            first.resolve();
        },
        calls: () => calls,
        called: first.promise,
    };
};

// Notifiers are made in nested suites, whose hooks run first, so they close before the connections they use

suite('ValkeyNotifier', () => {
    const withContext = beforeEach(valkeyContext).beforeEach(async () => ({
        otherSubscriber: await connectValkey(),
    }));
    withContext.afterEach(async context => {
        await Promise.all([context.otherSubscriber.quit(), closeValkey(context)]);
    });

    suite('Two servers', () => {
        const withNotifiers = withContext.beforeEach(
            async ({ valkey, subscriber, otherSubscriber, channel }) => ({
                publishing: await ValkeyNotifier.listen({ publisher: valkey, subscriber, channel }),
                listening: await ValkeyNotifier.listen({
                    publisher: valkey,
                    subscriber: otherSubscriber,
                    channel,
                }),
            })
        );
        withNotifiers.afterEach(async ({ publishing, listening }) => {
            await Promise.all([publishing.close(), listening.close()]);
        });

        withNotifiers.test(
            'Wakes a listener of the identity on another server',
            async ({ publishing, listening }) => {
                const { listener, called } = counter();
                listening.subscribe(identity, listener);
                await publishing.publish(identity);
                await called;
            }
        );

        withNotifiers.test(
            'Ignores other identities, and other channels on its connection',
            async ({ valkey, channel, otherSubscriber, publishing, listening }) => {
                const { listener, calls, called } = counter();
                listening.subscribe(identity, listener);
                await otherSubscriber.subscribe(`${channel}:other`);
                await valkey.publish(`${channel}:other`, identity);
                await publishing.publish(otherIdentity);
                // Messages arrive in order, so once this one is heard the others were too
                await publishing.publish(identity);
                await called;
                expect(calls()).to.equal(1);
            }
        );

        withNotifiers.test(
            'Calls a listener once for each subscription',
            async ({ publishing, listening }) => {
                const { listener, calls, called } = counter();
                listening.subscribe(identity, listener);
                listening.subscribe(identity, listener);
                await publishing.publish(identity);
                await called;
                expect(calls()).to.equal(2);
            }
        );

        withNotifiers.test(
            'Stops calling a listener once unsubscribed, keeping the others',
            async ({ publishing, listening }) => {
                const removed = counter();
                const kept = counter();
                const unsubscribe = listening.subscribe(identity, removed.listener);
                listening.subscribe(identity, kept.listener);
                unsubscribe();
                await publishing.publish(identity);
                await kept.called;
                expect(removed.calls()).to.equal(0);
            }
        );

        withNotifiers.test(
            'Unsubscribing again leaves later subscriptions',
            async ({ publishing, listening }) => {
                const unsubscribe = listening.subscribe(identity, () => {});
                unsubscribe();
                const { listener, called } = counter();
                listening.subscribe(identity, listener);
                unsubscribe();
                await publishing.publish(identity);
                await called;
            }
        );

        withNotifiers.test(
            'Unsubscribes its connection when closed',
            async ({ valkey, channel, listening }) => {
                await listening.close();
                expect(await valkey.pubsub('NUMSUB', channel)).to.deep.equal([channel, 1]);
            }
        );
    });

    suite('Default channel', () => {
        const withDefault = withContext.beforeEach(async ({ valkey, otherSubscriber }) => ({
            notifier: await ValkeyNotifier.listen({
                publisher: valkey,
                subscriber: otherSubscriber,
            }),
        }));
        withDefault.afterEach(async ({ notifier }) => {
            await notifier.close();
        });

        withDefault.test(
            'Uses the idempotency_keys channel by default',
            async ({ subscriber, notifier }) => {
                await subscriber.subscribe('idempotency_keys');
                const heard = once(subscriber, 'message');
                await notifier.publish(identity);
                expect(await heard).to.deep.equal(['idempotency_keys', identity]);
            }
        );
    });
});

suite('PostgresNotifier', () => {
    const channel = 'Idempotency "Keys"';
    const withContext = withDatabase().beforeEach(async ({ database }) => {
        const otherListener = new Client({ connectionString: database.url });
        await otherListener.connect();
        return { otherListener };
    });
    withContext.afterEach(async ({ otherListener }) => {
        await otherListener.end();
    });

    withContext.test(
        'Uses the idempotency_keys channel by default',
        async ({ pool, otherListener }) => {
            const notifier = await PostgresNotifier.listen({
                publisher: pool,
                listener: otherListener,
            });
            const heard = once(otherListener, 'notification');
            await notifier.publish(identity);
            expect(await heard).to.have.nested.property('[0].channel', 'idempotency_keys');
            await notifier.close();
        }
    );

    /**
     * Connects a client of its own and ends its connection from the server, as a Postgres restart would.
     *
     * @param url - Database to connect to
     * @param pool - Another connection, to end it from
     * @returns The client, and its end
     */
    const droppable = async (
        url: string,
        pool: { query: (text: string, values: unknown[]) => Promise<unknown> }
    ) => {
        const client = new Client({ connectionString: url });
        await client.connect();
        const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        return {
            client,
            drop: async () => {
                await pool.query('SELECT pg_terminate_backend($1)', [rows[0]!.pid]);
            },
        };
    };

    withContext.test(
        'Reports a dropped connection, and closes without it',
        async ({ database, pool }) => {
            const { client, drop } = await droppable(database.url, pool);
            const failed = pDefer<Error>();
            const notifier = await PostgresNotifier.listen({
                publisher: pool,
                listener: client,
                onError: error => {
                    failed.resolve(error);
                },
            });
            await drop();
            expect(await failed.promise).to.be.instanceOf(Error);
            await notifier.close();
        }
    );

    withContext.test(
        'Survives a dropped connection without onError',
        async ({ database, pool }) => {
            const { client, drop } = await droppable(database.url, pool);
            const notifier = await PostgresNotifier.listen({ publisher: pool, listener: client });
            // Not `once()`, which rejects on the `error` event this test is about
            const ended = new Promise<void>(resolve => {
                client.on('end', resolve);
            });
            await drop();
            await ended;
            await notifier.close();
        }
    );

    withContext.test('Rejects an empty channel', async ({ pool, otherListener }) => {
        await expect(
            PostgresNotifier.listen({ publisher: pool, listener: otherListener, channel: '' })
        ).to.be.rejectedWith(IdempotencyKeysOptionError);
    });

    suite('Two servers', () => {
        const withNotifiers = withContext.beforeEach(async ({ pool, listener, otherListener }) => ({
            publishing: await PostgresNotifier.listen({ publisher: pool, listener, channel }),
            listening: await PostgresNotifier.listen({
                publisher: pool,
                listener: otherListener,
                channel,
            }),
        }));
        withNotifiers.afterEach(async ({ publishing, listening }) => {
            await Promise.all([publishing.close(), listening.close()]);
        });

        withNotifiers.test(
            'Wakes a listener of the identity on another server',
            async ({ publishing, listening }) => {
                const { listener, called } = counter();
                listening.subscribe(identity, listener);
                await publishing.publish(identity);
                await called;
            }
        );

        withNotifiers.test(
            'Ignores other identities, and other channels on its connection',
            async ({ pool, otherListener, publishing, listening }) => {
                const { listener, calls, called } = counter();
                listening.subscribe(identity, listener);
                await otherListener.query('LISTEN other');
                await pool.query("SELECT pg_notify('other', $1)", [identity]);
                await publishing.publish(otherIdentity);
                // Notifications arrive in order, so once this one is heard the others were too
                await publishing.publish(identity);
                await called;
                expect(calls()).to.equal(1);
            }
        );

        withNotifiers.test('Stops listening when closed', async ({ otherListener, listening }) => {
            await listening.close();
            const { rows } = await otherListener.query('SELECT pg_listening_channels() AS channel');
            expect(rows).to.deep.equal([]);
        });
    });
});
