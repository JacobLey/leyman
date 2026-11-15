import type { Client, Pool } from 'pg';
import type { IdempotencyNotifier, IdempotencyStore } from 'idempotency-keys';
import type { DynamoDbContext } from '#test/helpers/dynamodb.js';
import type { ValkeyContext } from '#test/helpers/valkey.js';
import { createHash } from 'node:crypto';
import { expect } from '@leyman/expect';
import { IdempotencyKeys, SPEC_VERSION } from 'idempotency-keys';
import { DynamoDbStore } from 'idempotency-keys/dynamodb';
import { PostgresNotifier, PostgresStore } from 'idempotency-keys/postgres';
import { ValkeyNotifier, ValkeyStore } from 'idempotency-keys/valkey';
import { suite, test } from 'mocha-chain';
import { withDatabase } from '#test/helpers/database.js';
import { dynamoDb } from '#test/helpers/dynamodb.js';
import { MemoryStore } from '#test/helpers/memory-store.js';
import { runScenario } from '#test/helpers/scenario.js';
import { closeValkey, valkeyContext } from '#test/helpers/valkey.js';
import { vectors } from '#test/helpers/vectors.js';

type Context = DynamoDbContext & ValkeyContext & { readonly pool: Pool; readonly listener: Client };

interface Setup {
    readonly store: IdempotencyStore;
    readonly notifier?: IdempotencyNotifier & { readonly close: () => Promise<void> };
}

/**
 * Gives a store shared by every test identities of this test's own, as the vectors' scenarios reuse keys.
 *
 * @param store - Store whose table every test shares
 * @param salt - Unique to the test
 * @returns The same store, on other identities
 */
const isolated = (store: IdempotencyStore, salt: string): IdempotencyStore => {
    const own = (identity: string) =>
        createHash('sha256').update(salt).update(identity).digest('hex');
    return {
        claim: async params => store.claim({ ...params, identity: own(params.identity) }),
        complete: async (identity, token, response) =>
            store.complete(own(identity), token, response),
        release: async (identity, token) => store.release(own(identity), token),
    };
};

const stores: readonly (readonly [string, (context: Context) => IdempotencyStore])[] = [
    ['Memory (the example store)', () => new MemoryStore()],
    ['Postgres', ({ pool }) => new PostgresStore({ client: pool })],
    [
        'DynamoDB',
        ({ dynamodb, table, prefix }) =>
            isolated(new DynamoDbStore({ connection: dynamodb, table }), prefix),
    ],
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
    test('Implements their spec version', () => {
        expect(SPEC_VERSION).to.equal(vectors.specVersion);
    });

    for (const [storeName, createStore] of stores) {
        suite(`${storeName} store`, () => {
            const withContext = withDatabase().beforeEach(valkeyContext).beforeEach(dynamoDb);
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
