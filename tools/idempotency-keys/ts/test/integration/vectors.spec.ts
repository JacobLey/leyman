import type { Client, Pool } from 'pg';
import type { IdempotencyNotifier, IdempotencyStore } from 'idempotency-keys';
import type { ValkeyContext } from '../helpers/valkey.js';
import {
    IdempotencyKeys,
    PostgresNotifier,
    PostgresStore,
    ValkeyNotifier,
    ValkeyStore,
} from 'idempotency-keys';
import { suite } from 'mocha-chain';
import { withDatabase } from '../helpers/database.js';
import { runScenario } from '../helpers/scenario.js';
import { closeValkey, valkeyContext } from '../helpers/valkey.js';
import { vectors } from '../helpers/vectors.js';

type Context = ValkeyContext & { readonly pool: Pool; readonly listener: Client };

interface Setup {
    readonly store: IdempotencyStore;
    readonly notifier?: IdempotencyNotifier & { readonly close: () => Promise<void> };
}

const stores: readonly (readonly [string, (context: Context) => IdempotencyStore])[] = [
    ['Postgres', ({ pool }) => new PostgresStore({ client: pool })],
    [
        'Valkey',
        ({ valkey, prefix }) =>
            new ValkeyStore({
                connection: { eval: async (...args) => valkey.callBuffer('EVAL', ...args) },
                prefix,
            }),
    ],
];

const notifiers: readonly (readonly [string, (context: Context) => Promise<Setup['notifier']>])[] =
    [
        ['none', async () => {}],
        [
            'Postgres LISTEN/NOTIFY',
            async ({ pool, listener, channel }) =>
                PostgresNotifier.listen({ publisher: pool, listener, channel }),
        ],
        [
            'Valkey pub/sub',
            async ({ valkey, subscriber, channel }) =>
                ValkeyNotifier.listen({ publisher: valkey, subscriber, channel }),
        ],
    ];

suite('Test vectors', () => {
    for (const [storeName, createStore] of stores) {
        suite(`${storeName} store`, () => {
            const withContext = withDatabase().beforeEach(valkeyContext);
            withContext.afterEach(closeValkey);

            for (const [notifierName, createNotifier] of notifiers) {
                // A suite of its own, so the notifier closes before the connections it uses
                suite(`${notifierName} notifier`, () => {
                    const withSetup = withContext.beforeEach(async context => ({
                        store: createStore(context),
                        notifier: await createNotifier(context),
                    }));
                    withSetup.afterEach(async ({ notifier }) => {
                        await notifier?.close();
                    });

                    for (const scenario of vectors.scenarios) {
                        withSetup.test(scenario.description, async ({ store, notifier }) => {
                            const keys = new IdempotencyKeys({
                                ...vectors.defaults,
                                ...scenario.options,
                                store,
                                ...(notifier && { notifier }),
                            });
                            await runScenario(scenario, keys);
                        });
                    }
                });
            }
        });
    }
});
