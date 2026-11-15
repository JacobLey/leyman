import type { SQS } from '@aws-sdk/client-sqs';
import type { SqsConnection } from '@leyman/demo-webhook-receiver';
import type { IdempotencyKeys } from 'idempotency-keys';
import { randomUUID } from 'node:crypto';
import { expectTypeOf } from 'expect-type';
import {
    createWebhookReceiver,
    signWebhook,
    WebhookSecretError,
} from '@leyman/demo-webhook-receiver';
import { expect } from '@leyman/expect';
import { beforeEach, suite, test } from 'mocha-chain';
import { createQueue, dynamoDbKeys, sqs } from '#test/helpers/aws.js';

const key = new Uint8Array(32);
key.fill(1);
const secret = `whsec_${key.toBase64()}`;
const now = 1_800_000_000_000;
const timestamp = now / 1000;
const encoder = new TextEncoder();

interface Delivery {
    readonly id: string;
    readonly body?: string;
    readonly timestamp?: number;
    readonly signature?: string;
}

/**
 * A delivery as a sender makes it.
 *
 * @param delivery - Id, and the body, timestamp and signature unless the defaults
 * @returns The request
 */
const deliver = async ({
    id,
    body = '{"type":"invoice.paid"}',
    timestamp: sentAt = timestamp,
    signature,
}: Delivery): Promise<Request> =>
    new Request('https://receiver.test/webhooks', {
        method: 'POST',
        headers: {
            'webhook-id': id,
            'webhook-timestamp': String(sentAt),
            'webhook-signature':
                signature ??
                (await signWebhook({
                    id,
                    timestamp: sentAt,
                    body: encoder.encode(body),
                    secrets: [secret],
                })),
        },
        body,
    });

/**
 * Receives every message in a queue, hiding each for the rest of the test.
 *
 * @param queueUrl - The queue to read
 * @returns Each message's body and attributes
 */
const received = async (queueUrl: string) => {
    const { Messages: messages = [] } = await sqs().receiveMessage({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        MessageAttributeNames: ['All'],
        VisibilityTimeout: 60,
    });
    return messages.map(({ Body: body, MessageAttributes: attributes = {} }) => ({
        body,
        id: attributes['webhook-id']?.StringValue,
        source: attributes['webhook-source']?.StringValue,
    }));
};

const receiver = (
    queueUrl: string,
    {
        sqsConnection = sqs(),
        idempotencyKeys = dynamoDbKeys(),
    }: {
        sqsConnection?: SqsConnection;
        idempotencyKeys?: IdempotencyKeys;
    } = {}
) =>
    createWebhookReceiver(
        { source: 'billing', secrets: [secret], sqs: sqsConnection, idempotencyKeys, queueUrl },
        { now: () => now }
    );

suite('createWebhookReceiver', () => {
    test('The SDK client fits the connection as is', () => {
        expectTypeOf<SQS>().toExtend<SqsConnection>();
    });

    test('Throws for a malformed secret', () => {
        expect(() =>
            createWebhookReceiver({
                source: 'billing',
                secrets: ['secret'],
                idempotencyKeys: dynamoDbKeys(),
                sqs: sqs(),
                queueUrl: 'unused',
            })
        ).to.throw(WebhookSecretError);
    });

    suite('Each test on a queue of its own', () => {
        const withQueue = beforeEach(async () => ({
            queueUrl: await createQueue(),
            id: `msg_${randomUUID()}`,
        }));

        withQueue.test('Sends a delivery to SQS and answers 202', async ({ queueUrl, id }) => {
            const response = await receiver(queueUrl)(await deliver({ id }));
            expect(response.status).to.equal(202);
            expect(await received(queueUrl)).to.deep.equal([
                { body: '{"type":"invoice.paid"}', source: 'billing', id },
            ]);
        });

        withQueue.test(
            'Checks the timestamp against the current time by default',
            async ({ queueUrl, id }) => {
                const handle = createWebhookReceiver({
                    source: 'billing',
                    secrets: [secret],
                    idempotencyKeys: dynamoDbKeys(),
                    sqs: sqs(),
                    queueUrl,
                });
                const response = await handle(
                    await deliver({ id, timestamp: Math.floor(Date.now() / 1000) })
                );
                expect(response.status).to.equal(202);
            }
        );

        withQueue.test('Answers 400 to a delivery without headers', async ({ queueUrl }) => {
            const response = await receiver(queueUrl)(
                new Request('https://receiver.test/webhooks', { method: 'POST', body: '{}' })
            );
            expect(response.status).to.equal(400);
            expect(await received(queueUrl)).to.deep.equal([]);
        });

        withQueue.test('Answers 401 to a stale delivery', async ({ queueUrl, id }) => {
            const response = await receiver(queueUrl)(
                await deliver({ id, timestamp: timestamp - 301 })
            );
            expect(response.status).to.equal(401);
            expect(await received(queueUrl)).to.deep.equal([]);
        });

        withQueue.test(
            'Answers 401 to a bad signature, without claiming its id',
            async ({ queueUrl, id }) => {
                const handle = receiver(queueUrl);
                const forged = await handle(await deliver({ id, signature: 'v1,AAAA' }));
                expect(forged.status).to.equal(401);
                // A claimed id would replay instead of sending
                const genuine = await handle(await deliver({ id }));
                expect(genuine.status).to.equal(202);
                expect(await received(queueUrl)).to.have.length(1);
            }
        );

        withQueue.test(
            'Replays a retry of a sent event, without sending it again',
            async ({ queueUrl, id }) => {
                const handle = receiver(queueUrl);
                await handle(await deliver({ id }));
                // A retry carries a new timestamp and signature
                const retry = await handle(await deliver({ id, timestamp: timestamp + 60 }));
                expect(retry.status).to.equal(202);
                expect(await received(queueUrl)).to.have.length(1);
            }
        );

        withQueue.test('Answers 422 to the same id with another body', async ({ queueUrl, id }) => {
            const handle = receiver(queueUrl);
            await handle(await deliver({ id }));
            const response = await handle(await deliver({ id, body: '{"type":"other"}' }));
            expect(response.status).to.equal(422);
        });

        withQueue.test(
            'Answers 503 when SQS refuses, and sends the retry',
            async ({ queueUrl, id }) => {
                const idempotencyKeys = dynamoDbKeys();
                // A queue that doesn't exist: SendMessage fails with QueueDoesNotExist
                const failed = await receiver(`${queueUrl}-missing`, { idempotencyKeys })(
                    await deliver({ id })
                );
                expect(failed.status).to.equal(503);
                const retry = await receiver(queueUrl, { idempotencyKeys })(await deliver({ id }));
                expect(retry.status).to.equal(202);
                expect(await received(queueUrl)).to.have.length(1);
            }
        );

        withQueue.test(
            'Answers 409 to a duplicate while the first is sending, then replays',
            async ({ queueUrl, id }) => {
                // Holds the first delivery inside SendMessage, so the duplicate arrives while it runs
                const sending = Promise.withResolvers<undefined>();
                const proceed = Promise.withResolvers<undefined>();
                const gated: SqsConnection = {
                    sendMessage: async input => {
                        sending.resolve(undefined);
                        await proceed.promise;
                        return sqs().sendMessage(input);
                    },
                };
                // No wait, so the duplicate answers at once instead of waiting for the first
                const handle = receiver(queueUrl, {
                    sqsConnection: gated,
                    idempotencyKeys: dynamoDbKeys({ waitMs: 0 }),
                });

                const first = handle(await deliver({ id }));
                await sending.promise;
                const duplicate = await handle(await deliver({ id }));
                proceed.resolve(undefined);

                expect(duplicate.status).to.equal(409);
                const firstResponse = await first;
                expect(firstResponse.status).to.equal(202);
                const retry = await handle(await deliver({ id }));
                expect(retry.status).to.equal(202);
                expect(await received(queueUrl)).to.have.length(1);
            }
        );
    });
});
