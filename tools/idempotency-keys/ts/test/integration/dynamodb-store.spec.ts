import type { DynamoDB } from '@aws-sdk/client-dynamodb';
import type { DynamoDbConnection, DynamoDbUpdateItemInput } from 'idempotency-keys/dynamodb';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { createTableInput, DynamoDbStore, updateTimeToLiveInput } from 'idempotency-keys/dynamodb';
import { suite, test } from 'mocha-chain';
import { withDynamoDb } from '#test/helpers/dynamodb.js';

const fingerprint = 'f'.repeat(64);
const otherFingerprint = 'e'.repeat(64);
const response = {
    status: 201,
    headers: [
        ['content-type', 'application/octet-stream'],
        ['set-cookie', 'a=1'],
        ['set-cookie', 'b=2'],
    ],
    body: Uint8Array.from([0, 255, 128, 10]),
} as const;

const longTimes = { leaseMs: 60_000, ttlMs: 86_400_000 };
const shortTimes = { leaseMs: 1, ttlMs: 2 };

const claim = async (
    store: DynamoDbStore,
    identity: string,
    token: string,
    times: { leaseMs: number; ttlMs: number } = longTimes,
    claimFingerprint = fingerprint
) => store.claim({ identity, fingerprint: claimFingerprint, token, ...times });

/**
 * A connection whose every request rejects with the error given.
 *
 * @param error - What each request rejects with
 * @returns The connection
 */
const rejecting = (error: unknown): DynamoDbConnection => {
    const reject = async () => {
        throw error;
    };
    return { putItem: reject, updateItem: reject, deleteItem: reject };
};

/**
 * Named as the SDK names it, without the item the SDK adds.
 */
class ConditionFailedError extends Error {
    // eslint-disable-next-line unicorn/custom-error-definition -- The SDK's name for a failed condition, which the store checks
    public override readonly name = 'ConditionalCheckFailedException';
}

/**
 * The expressions in the spec's DynamoDB section, in order: claim condition, token condition, complete update, renew
 * update.
 *
 * @returns Each fenced expression
 */
const specExpressions = async (): Promise<string[]> => {
    const spec = await readFile(new URL('../../../SPEC.md', import.meta.url), 'utf8');
    const section = spec.slice(spec.indexOf('### DynamoDB'), spec.indexOf('## Notifiers'));
    return section
        .matchAll(/^```\n(?<expression>.*?)\n```$/gmsv)
        .map(({ groups }) => groups!.expression!)
        .toArray();
};

suite('DynamoDbStore', () => {
    test('Writes the expressions of the spec', async () => {
        const expressions: (string | undefined)[] = [];
        const record = async (input: Partial<DynamoDbUpdateItemInput>) => {
            expressions.push(input.ConditionExpression, input.UpdateExpression);
            return {};
        };
        // A fake: every condition holds, so each operation makes one request
        const store = new DynamoDbStore({
            connection: { putItem: record, updateItem: record, deleteItem: record },
        });
        const identity = 'a'.repeat(64);
        const token = '1'.repeat(32);

        await claim(store, identity, token);
        await store.complete(identity, token, response);
        await store.release(identity, token);
        await store.renew({ identity, token, ...longTimes });

        const [claimCondition, tokenCondition, completeUpdate, renewUpdate] =
            await specExpressions();
        expect(expressions).to.deep.equal([
            claimCondition,
            undefined,
            tokenCondition,
            completeUpdate,
            tokenCondition,
            undefined,
            tokenCondition,
            renewUpdate,
        ]);
    });

    test('The SDK client fits the connection as is', () => {
        expectTypeOf<DynamoDB>().toExtend<DynamoDbConnection>();
    });

    test('Creates the table of the spec by default', async () => {
        const spec = await readFile(new URL('../../../SPEC.md', import.meta.url), 'utf8');
        expect(spec).to.include('`idempotency_keys` unless configured');
        expect(createTableInput()).to.deep.equal({
            TableName: 'idempotency_keys',
            AttributeDefinitions: [{ AttributeName: 'identity', AttributeType: 'B' }],
            KeySchema: [{ AttributeName: 'identity', KeyType: 'HASH' }],
            BillingMode: 'PAY_PER_REQUEST',
        });
    });

    test('Turns on Time to Live for ttl in the default table', () => {
        expect(updateTimeToLiveInput()).to.deep.equal({
            TableName: 'idempotency_keys',
            TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
        });
    });

    test('Writes to idempotency_keys by default', async () => {
        const tables: string[] = [];
        const connection: DynamoDbConnection = {
            putItem: async input => {
                tables.push(input.TableName);
            },
            updateItem: async input => {
                tables.push(input.TableName);
            },
            deleteItem: async input => {
                tables.push(input.TableName);
            },
        };
        const store = new DynamoDbStore({ connection });
        await claim(store, 'a'.repeat(64), '1'.repeat(32));
        await store.complete('a'.repeat(64), '1'.repeat(32), response);
        await store.release('a'.repeat(64), '1'.repeat(32));
        await store.renew({ identity: 'a'.repeat(64), token: '1'.repeat(32), ...longTimes });
        expect(tables).to.deep.equal([
            'idempotency_keys',
            'idempotency_keys',
            'idempotency_keys',
            'idempotency_keys',
        ]);
    });

    test('Passes on a failed condition that carries no item', async () => {
        const error = new ConditionFailedError();
        const store = new DynamoDbStore({ connection: rejecting(error) });
        await expect(claim(store, 'a'.repeat(64), '1'.repeat(32))).to.be.rejectedWith(error);
    });

    test('Passes on a rejection that is no error', async () => {
        const store = new DynamoDbStore({ connection: rejecting(null) });
        await expect(claim(store, 'a'.repeat(64), '1'.repeat(32))).to.be.rejected;
        await expect(store.release('a'.repeat(64), '1'.repeat(32))).to.be.rejected;
    });

    const withStore = withDynamoDb.beforeEach(({ dynamodb, table }) => ({
        store: new DynamoDbStore({ connection: dynamodb, table }),
        identity: randomBytes(32).toString('hex'),
    }));

    withStore.test(
        'Writes a running item, then a completed one, as the spec describes',
        async ({ dynamodb, table, store, identity }) => {
            const key = { identity: { B: Buffer.from(identity, 'hex') } };
            const before = Date.now();
            await claim(store, identity, '1'.repeat(32));
            const after = Date.now();
            const { Item: running } = await dynamodb.getItem({
                TableName: table,
                Key: key,
                ConsistentRead: true,
            });
            expect(running).to.have.keys([
                'identity',
                'fingerprint',
                'token',
                'lease_expires_at',
                'expires_at',
                'ttl',
            ]);
            expect(running!.fingerprint).to.deep.equal({ B: Buffer.from(fingerprint, 'hex') });
            expect(running!.token).to.deep.equal({ S: '1'.repeat(32) });
            const leaseExpiresAt = Number(running!.lease_expires_at!.N);
            const expiresAt = Number(running!.expires_at!.N);
            expect(leaseExpiresAt).to.be.within(before + 60_000, after + 60_000);
            expect(expiresAt - leaseExpiresAt).to.equal(86_400_000 - 60_000);
            expect(running!.ttl).to.deep.equal({ N: String(Math.ceil(expiresAt / 1000)) });

            await store.complete(identity, '1'.repeat(32), response);
            const { Item: completed } = await dynamodb.getItem({
                TableName: table,
                Key: key,
                ConsistentRead: true,
            });
            expect(completed).to.deep.equal({
                identity: { B: Buffer.from(identity, 'hex') },
                fingerprint: { B: Buffer.from(fingerprint, 'hex') },
                expires_at: running!.expires_at,
                ttl: running!.ttl,
                status: { N: '201' },
                headers: { S: JSON.stringify(response.headers) },
                body: { B: Buffer.from(response.body) },
            });
        }
    );

    withStore.test(
        'Renews the lease, the expiry and the ttl, as the spec describes',
        async ({ dynamodb, table, store, identity }) => {
            const key = { identity: { B: Buffer.from(identity, 'hex') } };
            await claim(store, identity, '1'.repeat(32), { leaseMs: 1000, ttlMs: 2000 });
            const before = Date.now();
            expect(await store.renew({ identity, token: '1'.repeat(32), ...longTimes })).to.equal(
                true
            );
            const after = Date.now();
            const { Item: renewed } = await dynamodb.getItem({
                TableName: table,
                Key: key,
                ConsistentRead: true,
            });
            expect(renewed!.token).to.deep.equal({ S: '1'.repeat(32) });
            const leaseExpiresAt = Number(renewed!.lease_expires_at!.N);
            const expiresAt = Number(renewed!.expires_at!.N);
            expect(leaseExpiresAt).to.be.within(before + 60_000, after + 60_000);
            expect(expiresAt - leaseExpiresAt).to.equal(86_400_000 - 60_000);
            expect(renewed!.ttl).to.deep.equal({ N: String(Math.ceil(expiresAt / 1000)) });
        }
    );

    withStore.test('Renews only with the token', async ({ store, identity }) => {
        await claim(store, identity, '1'.repeat(32));
        expect(await store.renew({ identity, token: '2'.repeat(32), ...longTimes })).to.equal(
            false
        );
    });

    withStore.test('Turns on Time to Live with its input', async ({ dynamodb, table }) => {
        await dynamodb.updateTimeToLive(updateTimeToLiveInput(table));
        const { TimeToLiveDescription: description } = await dynamodb.describeTimeToLive({
            TableName: table,
        });
        expect(description).to.include({ AttributeName: 'ttl' });
        expect(description!.TimeToLiveStatus).to.be.oneOf(['ENABLED', 'ENABLING']);
    });

    withStore.test('Replays a binary body byte for byte', async ({ store, identity }) => {
        await claim(store, identity, '1'.repeat(32));
        await store.complete(identity, '1'.repeat(32), response);
        const result = await claim(store, identity, '2'.repeat(32));
        expect(result).to.deep.include({ state: 'completed', fingerprint });
        expect(result).to.have.deep.nested.property('response.headers', response.headers);
        expect(result)
            .to.have.nested.property('response.body')
            .that.deep.equals(Buffer.from(response.body));
    });

    withStore.test('Replays an empty body', async ({ store, identity }) => {
        await claim(store, identity, '1'.repeat(32));
        expect(
            await store.complete(identity, '1'.repeat(32), {
                status: 200,
                headers: [],
                body: new Uint8Array(),
            })
        ).to.equal(true);
        const result = await claim(store, identity, '2'.repeat(32));
        expect(result).to.deep.include({ state: 'completed', fingerprint });
        expect(result).to.have.nested.property('response.status', 200);
        expect(result).to.have.deep.nested.property('response.headers', []);
        expect(result).to.have.nested.property('response.body').with.lengthOf(0);
    });

    withStore.test('Answers running while the lease lasts', async ({ store, identity }) => {
        await claim(store, identity, '1'.repeat(32));
        expect(await claim(store, identity, '2'.repeat(32))).to.deep.equal({
            state: 'running',
            fingerprint,
        });
    });

    withStore.test(
        'Takes over a running item of the same fingerprint whose lease ran out',
        async ({ store, identity }) => {
            await claim(store, identity, '1'.repeat(32), { leaseMs: 1, ttlMs: 60_000 });
            await setTimeout(10);
            expect(await claim(store, identity, '2'.repeat(32))).to.deep.equal({
                state: 'claimed',
            });
            // The first request's token is gone
            expect(await store.complete(identity, '1'.repeat(32), response)).to.equal(false);
            expect(await store.release(identity, '1'.repeat(32))).to.equal(false);
            expect(await store.complete(identity, '2'.repeat(32), response)).to.equal(true);
        }
    );

    withStore.test(
        'Keeps a running item of another fingerprint whose lease ran out',
        async ({ store, identity }) => {
            await claim(store, identity, '1'.repeat(32), { leaseMs: 1, ttlMs: 60_000 });
            await setTimeout(10);
            expect(
                await claim(store, identity, '2'.repeat(32), longTimes, otherFingerprint)
            ).to.deep.equal({ state: 'running', fingerprint });
        }
    );

    withStore.test(
        'Writes over an expired item of another fingerprint',
        async ({ store, identity }) => {
            // Long enough to complete before it expires, so the item is an expired completed one
            await claim(store, identity, '1'.repeat(32), { leaseMs: 200, ttlMs: 200 });
            expect(await store.complete(identity, '1'.repeat(32), response)).to.equal(true);
            await setTimeout(250);
            expect(
                await claim(store, identity, '2'.repeat(32), longTimes, otherFingerprint)
            ).to.deep.equal({ state: 'claimed' });
            expect(await claim(store, identity, '3'.repeat(32))).to.deep.equal({
                state: 'running',
                fingerprint: otherFingerprint,
            });
        }
    );

    withStore.test('Stores nothing once the key expired', async ({ store, identity }) => {
        await claim(store, identity, '1'.repeat(32), shortTimes);
        await setTimeout(10);
        expect(await store.complete(identity, '1'.repeat(32), response)).to.equal(false);
    });

    withStore.test('Releases nothing once the key expired', async ({ store, identity }) => {
        await claim(store, identity, '1'.repeat(32), shortTimes);
        await setTimeout(10);
        expect(await store.release(identity, '1'.repeat(32))).to.equal(false);
    });

    withStore.test('Completes and releases only with the token', async ({ store, identity }) => {
        await claim(store, identity, '1'.repeat(32));
        expect(await store.complete(identity, '2'.repeat(32), response)).to.equal(false);
        expect(await store.release(identity, '2'.repeat(32))).to.equal(false);
        expect(await store.release(identity, '1'.repeat(32))).to.equal(true);
        expect(await claim(store, identity, '3'.repeat(32))).to.deep.equal({ state: 'claimed' });
    });

    withStore.test('Renews nothing once the key expired', async ({ store, identity }) => {
        await claim(store, identity, '1'.repeat(32), shortTimes);
        await setTimeout(10);
        expect(await store.renew({ identity, token: '1'.repeat(32), ...longTimes })).to.equal(
            false
        );
    });

    withStore.test(
        'Completes, releases and renews nothing without an item',
        async ({ store, identity }) => {
            expect(await store.complete(identity, '1'.repeat(32), response)).to.equal(false);
            expect(await store.release(identity, '1'.repeat(32))).to.equal(false);
            expect(await store.renew({ identity, token: '1'.repeat(32), ...longTimes })).to.equal(
                false
            );
        }
    );

    withStore.test(
        'Refuses a response over 400 KB, leaving the attempt running',
        async ({ store, identity }) => {
            await claim(store, identity, '1'.repeat(32));
            await expect(
                store.complete(identity, '1'.repeat(32), {
                    status: 200,
                    headers: [],
                    body: new Uint8Array(400 * 1024),
                })
            ).to.be.rejectedWith(/size/iv);
            expect(await claim(store, identity, '2'.repeat(32))).to.deep.equal({
                state: 'running',
                fingerprint,
            });
            expect(await store.release(identity, '1'.repeat(32))).to.equal(true);
        }
    );

    withStore.test('Passes on any error but a failed condition', async ({ dynamodb, identity }) => {
        const store = new DynamoDbStore({ connection: dynamodb, table: 'missing_table' });
        await expect(
            claim(store, identity, '1'.repeat(32))
        ).to.be.rejected.and.eventually.have.property('name', 'ResourceNotFoundException');
        await expect(
            store.complete(identity, '1'.repeat(32), response)
        ).to.be.rejected.and.eventually.have.property('name', 'ResourceNotFoundException');
        await expect(
            store.release(identity, '1'.repeat(32))
        ).to.be.rejected.and.eventually.have.property('name', 'ResourceNotFoundException');
        await expect(
            store.renew({ identity, token: '1'.repeat(32), ...longTimes })
        ).to.be.rejected.and.eventually.have.property('name', 'ResourceNotFoundException');
    });
});
