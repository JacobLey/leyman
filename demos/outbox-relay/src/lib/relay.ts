import type {
    PutEventsCommandInput,
    PutEventsCommandOutput,
    PutEventsRequestEntry,
} from '@aws-sdk/client-eventbridge';
import type { Pool } from 'pg';
import type { ClaimedRow, Failure } from './claim.js';
import { claim, markSent, park, retryLater } from './claim.js';

/**
 * The one EventBridge call the relay makes. The SDK's `EventBridge` client fits, as does a wrapper around it.
 */
export interface PutEventsClient {
    readonly putEvents: (input: PutEventsCommandInput) => Promise<PutEventsCommandOutput>;
}

/**
 * The most entries `PutEvents` takes in one call: more fail the whole request. `schema.sql` caps a row's size so that
 * this many always fit in one request.
 */
export const maxBatch = 10;

/**
 * The entry error codes worth retrying, as AWS classifies them: every other code (`MalformedDetail`,
 * `InvalidArgument`, `NotAuthorizedForSourceException`, ...) fails the same way again.
 * https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEventsResultEntry.html
 */
export const retryableCodes: ReadonlySet<string> = new Set([
    'InternalFailure',
    'ThrottlingException',
]);

const firstRetryDelayMs = 1000;
const maxRetryDelayMs = 300_000;
const defaultLeaseMs = 30_000;
const defaultMaxAttempts = 10;

/**
 * How long a row waits after its `attempts`th failed with a retryable code: doubling from a second, up to 5 minutes.
 *
 * @param attempts - Claims so far
 * @returns Delay in milliseconds
 */
export const retryDelayMs = (attempts: number): number =>
    Math.min(firstRetryDelayMs * 2 ** (attempts - 1), maxRetryDelayMs);

/**
 * The `PutEvents` entry for a row. `outboxId` is added to an object detail, so consumers can drop the duplicates
 * that at-least-once delivery sends. EventBridge stamps a new event `id` on every call, so neither that nor a FIFO
 * queue's content-based deduplication recognizes a resend.
 *
 * A detail that isn't an object (only a writer other than `enqueue` stores one) is sent as it is, and EventBridge
 * refuses it as `MalformedDetail`.
 *
 * @param row - Claimed row
 * @param busName - Where it goes
 * @returns Entry for `PutEvents`
 */
export const toEntry = (row: ClaimedRow, busName: string): PutEventsRequestEntry => ({
    EventBusName: busName,
    Source: row.source,
    DetailType: row.detailType,
    Detail: JSON.stringify(
        typeof row.detail === 'object' && row.detail !== null && !Array.isArray(row.detail)
            ? { ...row.detail, outboxId: row.id }
            : row.detail
    ),
});

/**
 * Options for {@link relayOnce}.
 */
export interface RelayOptions {
    /**
     * Where the outbox is.
     */
    readonly pool: Pool;
    /**
     * Sends the events.
     */
    readonly eventBridge: PutEventsClient;
    /**
     * Event bus to send to. EventBridge drops events for a bus that doesn't exist without reporting a failure.
     */
    readonly busName: string;
    /**
     * How long a claim lasts: longer than `PutEvents` takes, SDK retries included, or a slow call's rows are sent
     * twice.
     *
     * @default 30000
     */
    readonly leaseMs?: number;
    /**
     * Claims after which a row failing with a retryable code is parked instead.
     *
     * @default 10
     */
    readonly maxAttempts?: number;
}

/**
 * What one pass did, by outbox id.
 */
export interface RelayResult {
    readonly sent: readonly string[];
    readonly retried: readonly string[];
    readonly parked: readonly string[];
}

/**
 * Claims up to 10 rows, sends them in one `PutEvents` call, and records each entry's outcome: sent, retried after a
 * delay (retryable codes), or parked (any other code).
 *
 * If the call itself fails (network, a whole-request error), or returns a result count other than the entries sent, it
 * rejects and records nothing: the rows come back when their lease expires.
 *
 * @param options - Outbox, client and bus
 * @returns Outbox ids by outcome. Fewer than 10 in all means the outbox was drained when it ran.
 * @rejects {Error} When `PutEvents` fails or returns a result count other than the entries sent, recording nothing
 */
export const relayOnce = async ({
    pool,
    eventBridge,
    busName,
    leaseMs = defaultLeaseMs,
    maxAttempts = defaultMaxAttempts,
}: RelayOptions): Promise<RelayResult> => {
    const rows = await claim(pool, { limit: maxBatch, leaseMs });
    if (rows.length === 0) {
        return { sent: [], retried: [], parked: [] };
    }
    const { Entries: results = [] } = await eventBridge.putEvents({
        Entries: rows.map(row => toEntry(row, busName)),
    });
    // Results line up with entries by position, so without one each it's unknown which rows were sent
    if (results.length !== rows.length) {
        throw new Error(
            `PutEvents returned ${results.length} results for ${rows.length} entries: recording nothing`
        );
    }

    const sent: string[] = [];
    const retries: (Failure & { delayMs: number })[] = [];
    const parked: Failure[] = [];
    for (const [index, row] of rows.entries()) {
        const code = results[index]!.ErrorCode;
        if (code === undefined) {
            sent.push(row.id);
        } else if (retryableCodes.has(code) && row.attempts < maxAttempts) {
            retries.push({ code, id: row.id, delayMs: retryDelayMs(row.attempts) });
        } else {
            parked.push({ code, id: row.id });
        }
    }
    await Promise.all([markSent(pool, sent), retryLater(pool, retries), park(pool, parked)]);
    return { sent, retried: retries.map(({ id }) => id), parked: parked.map(({ id }) => id) };
};
