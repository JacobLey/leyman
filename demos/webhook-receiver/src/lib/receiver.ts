/* eslint-disable @typescript-eslint/naming-convention -- SQS names its request fields in PascalCase */
import type { IdempotencyKeys } from 'idempotency-keys';
import type { WebhookRefusal } from '#internal/lib/signature.js';
import { computeFingerprint } from 'idempotency-keys';
import { parseWebhookSecret, verifyWebhook } from '#internal/lib/signature.js';

/**
 * @import { WebhookSecretError } from '#internal/lib/signature.js'
 */

/**
 * What the receiver sends to `SendMessage`: the fields it sets.
 */
export interface SqsSendMessageInput {
    QueueUrl: string;
    MessageBody: string;
    MessageAttributes: Record<string, { DataType: 'String'; StringValue: string }>;
}

/**
 * The part of an SQS client the receiver uses. The SDK's `SQS` fits as is.
 */
export interface SqsConnection {
    sendMessage: (input: SqsSendMessageInput) => Promise<unknown>;
}

export interface WebhookReceiverParams {
    /**
     * Who sends to this endpoint, such as `billing-provider`: the scope of its event ids, so two senders' ids never
     * collide.
     */
    readonly source: string;
    /**
     * Each secret (`whsec_...`) to accept: the old and the new one while rotating.
     */
    readonly secrets: readonly string[];
    /**
     * Where event ids are kept. Keep them about 7 days (`ttlMs`): senders retry for about 3.
     */
    readonly idempotencyKeys: IdempotencyKeys;
    /**
     * Client to send events with. The receiver never closes it.
     */
    readonly sqs: SqsConnection;
    /**
     * The queue that workers read events from.
     */
    readonly queueUrl: string;
}

export interface WebhookReceiverOptions {
    /**
     * The current time, in milliseconds since the epoch.
     *
     * @default Date.now
     */
    readonly now?: () => number;
    /**
     * How far a delivery's timestamp may be from `now`, either way.
     *
     * @default 300_000
     */
    readonly toleranceMs?: number;
}

const accepted = 202;
const badRequest = 400;
const unauthorized = 401;
const conflict = 409;
const mismatch = 422;
const unavailable = 503;

const refusalStatus: Readonly<Record<WebhookRefusal, number>> = {
    'missing-header': badRequest,
    malformed: badRequest,
    signature: unauthorized,
    stale: unauthorized,
    future: unauthorized,
};

const decoder = new TextDecoder();

/**
 * Whether SQS refused the body itself, which it does the same way on every retry: it allows only some Unicode
 * characters ([SendMessage](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SendMessage.html)).
 *
 * @param error - What `sendMessage` rejected with
 * @returns `true` for the SDK's `InvalidMessageContents`
 */
const isRefusedBody = (error: unknown): boolean =>
    Error.isError(error) && error.name === 'InvalidMessageContents';

/**
 * The fixed operation every event is claimed under, within its sender's scope.
 */
const operation = 'webhook';

/**
 * Creates a fetch handler receiving Standard Webhooks deliveries: it checks the signature and timestamp, claims the
 * event id so a duplicate delivery sends nothing, sends the body to SQS, and answers `202`.
 *
 * - `400`/`401`: missing headers, or a bad signature or timestamp. Nothing is claimed.
 * - `202`: sent now, or a duplicate of an event already sent (replayed, not sent again).
 * - `409`: the same event is being handled right now; the sender's retry replays.
 * - `422`: the same id with another body, or a body SQS refuses to carry (`InvalidMessageContents`): sender bugs. A
 *   refused body is stored as `422`, so the sender's retries replay it without calling SQS again.
 * - `503`: SQS failed otherwise. The id is released, so the sender's retry sends it.
 *
 * A failure of the store rejects, as does a release that fails after `503`'s send failure (its lease then runs out).
 *
 * @param params - Sender, secrets, idempotency keys, SQS client and queue
 * @param options - Clock and tolerance
 * @returns The handler
 * @throws {WebhookSecretError} For a malformed secret
 */
export const createWebhookReceiver = (
    { source, secrets, idempotencyKeys, sqs, queueUrl }: WebhookReceiverParams,
    { now = Date.now, ...verifyOptions }: WebhookReceiverOptions = {}
): ((request: Request) => Promise<Response>) => {
    // Fails at start-up, rather than on the first delivery
    for (const secret of secrets) {
        parseWebhookSecret(secret);
    }

    return async request => {
        // Read once, as bytes: the signature covers the body exactly as sent
        const body = new Uint8Array(await request.arrayBuffer());
        const verified = await verifyWebhook(
            { headers: request.headers, body, secrets },
            { ...verifyOptions, now: now() }
        );
        if (!verified.valid) {
            return new Response(verified.reason, { status: refusalStatus[verified.reason] });
        }

        // Over the body only: a retry has a new timestamp and signature, but the same id and body
        const fingerprint = await computeFingerprint({
            method: 'POST',
            target: '/',
            headers: [],
            named: [],
            body,
        });
        // Claimed after verifying, so an unsigned request can't take an id, and before sending, so a concurrent
        // duplicate sends nothing
        const begun = await idempotencyKeys.begin({
            scope: source,
            key: verified.id,
            fingerprint,
            operation,
        });
        if (begun.outcome === 'replay') {
            return new Response(null, { status: begun.response.status });
        }
        if (begun.outcome !== 'run') {
            return new Response(null, {
                status: begun.outcome === 'conflict' ? conflict : mismatch,
            });
        }

        try {
            await sqs.sendMessage({
                QueueUrl: queueUrl,
                MessageBody: decoder.decode(body),
                // A crash after sending but before the response is stored sends again on the retry: workers
                // dedupe on these
                MessageAttributes: {
                    'webhook-id': { DataType: 'String', StringValue: verified.id },
                    'webhook-source': { DataType: 'String', StringValue: source },
                },
            });
        } catch (error) {
            if (isRefusedBody(error)) {
                // Every retry carries the same body, so stored: the retries replay it rather than fail at SQS again
                await begun.attempt.respond({
                    status: mismatch,
                    headers: [],
                    body: new Uint8Array(),
                });
                return new Response(null, { status: mismatch });
            }
            // Otherwise the stored id would drop the sender's retry, and the event with it
            await begun.attempt.release();
            return new Response(null, { status: unavailable });
        }
        await begun.attempt.respond({ status: accepted, headers: [], body: new Uint8Array() });
        return new Response(null, { status: accepted });
    };
};
