import type {
    ChangeMessageVisibilityCommandInput,
    DeleteMessageCommandInput,
    Message,
    ReceiveMessageCommandInput,
    ReceiveMessageCommandOutput,
} from '@aws-sdk/client-sqs';
import type { IdempotencyAttempt, IdempotencyStore } from 'idempotency-keys';
import type { ReceivedJob } from './job.js';
import { IdempotencyKeys } from 'idempotency-keys';
import { JobLeaseLostError, WorkerOptionError } from './errors.js';
import { decodeJob, fingerprintBody } from './job.js';
import { toSeconds } from './queue.js';

/**
 * The methods a worker needs from `SQS` of `@aws-sdk/client-sqs`, which fits as is.
 */
export interface WorkerSqs {
    receiveMessage: (
        input: ReceiveMessageCommandInput,
        options?: { abortSignal?: AbortSignal }
    ) => Promise<ReceiveMessageCommandOutput>;
    deleteMessage: (input: DeleteMessageCommandInput) => Promise<unknown>;
    changeMessageVisibility: (input: ChangeMessageVisibilityCommandInput) => Promise<unknown>;
}

/**
 * Runs a job. It may reject to retry the job later. It should stop when `signal` aborts, which happens when a
 * heartbeat finds that another worker may have the job: its visibility couldn't be extended, or its lease couldn't be
 * renewed.
 */
export type JobHandler = (job: ReceivedJob, signal: AbortSignal) => Promise<void>;

export interface WorkerOptions {
    readonly sqs: WorkerSqs;
    readonly queueUrl: string;
    /**
     * Where the ids of jobs that ran are kept, such as idempotency-keys' `DynamoDbStore`. It must have the optional
     * `renew`, which every built-in store has. The store is never closed.
     */
    readonly store: IdempotencyStore;
    readonly handle: JobHandler;
    /**
     * How long a job stays hidden from other workers after each heartbeat, rounded up to whole seconds. The heartbeat
     * runs every third of it, so a slow call to SQS doesn't let the job show, and renews the job's lease too.
     */
    readonly visibilityTimeoutMs: number;
    /**
     * How long a job's claim lasts without a heartbeat renewing it, after which another delivery may take the job
     * over (a worker that crashed stops renewing). Each heartbeat renews it, so it only has to cover the time between
     * heartbeats (a third of `visibilityTimeoutMs`), plus a slow call to the store and the clock drift between
     * workers: a few heartbeats' worth is plenty. Must be more than one heartbeat's interval.
     */
    readonly leaseMs: number;
    /**
     * How long a job's id is remembered, to skip it when it comes again.
     *
     * @default 86_400_000 (24 hours)
     */
    readonly ttlMs?: number;
    /**
     * How long a job that didn't finish waits before it's delivered again, given its receive count.
     *
     * @default Doubling from 1 second, up to 15 minutes
     */
    readonly retryDelayMs?: (receiveCount: number) => number;
    /**
     * How long a receive waits for a job (long polling), rounded up to whole seconds, up to 20 seconds.
     *
     * @default 20_000
     */
    readonly waitTimeMs?: number;
    /**
     * The most messages one receive takes, up to 10.
     *
     * @default 10
     */
    readonly maxMessages?: number;
}

/**
 * What became of a message:
 *
 * - `done`: the job ran, and the message was deleted
 * - `duplicate`: the job had already run, so the message was deleted without running it
 * - `busy`: another delivery of the job is running, so it waits to come again
 * - `failed`: the handler rejected (with `error`), so it waits to come again
 * - `reused`: the job's id already ran with another body, so it waits, and ends up in the dead-letter queue
 * - `invalid`: the body isn't a job, so it waits, and ends up in the dead-letter queue
 * - `deferred`: on a FIFO queue, a job before it in its group didn't finish, so it's left for after that one
 */
export type JobOutcome =
    | 'busy'
    | 'deferred'
    | 'done'
    | 'duplicate'
    | 'failed'
    | 'invalid'
    | 'reused';

export interface JobResult {
    readonly messageId: string;
    /**
     * `null` for a message that isn't a job, or one deferred before it was read.
     */
    readonly jobId: string | null;
    readonly outcome: JobOutcome;
    readonly error?: unknown;
}

export interface Worker {
    /**
     * Receives once, and handles what came, waiting for every job to end.
     *
     * @param signal - Stops a receive that's waiting for messages
     * @returns What became of each message, in the order received
     */
    poll: (signal?: AbortSignal) => Promise<JobResult[]>;
    /**
     * Polls until `signal` aborts, then lets the jobs it has finish.
     *
     * @param signal - Stops the worker
     */
    run: (signal: AbortSignal) => Promise<void>;
}

const defaultTtlMs = 86_400_000;
const maxDefaultRetryDelayMs = 900_000;
const firstRetryDelayMs = 1000;
const heartbeatsPerTimeout = 3;
const defaultWaitTimeMs = 20_000;
const defaultMaxMessages = 10;
const okStatus = 200;
/**
 * The job ran, as far as idempotency-keys is concerned, which stores a response for each key.
 */
const ranResponse = { status: okStatus, headers: [], body: new Uint8Array() };

/**
 * Doubles from 1 second per delivery, up to 15 minutes.
 *
 * @param receiveCount - Deliveries so far
 * @returns Delay in milliseconds
 */
export const defaultRetryDelayMs = (receiveCount: number): number =>
    Math.min(firstRetryDelayMs * 2 ** (receiveCount - 1), maxDefaultRetryDelayMs);

/**
 * A worker for one queue. SQS delivers each message at least once, so each job's id is claimed through
 * idempotency-keys before it runs: a duplicate delivery of a job that ran is deleted, and one of a job that's running
 * waits.
 *
 * While a job runs, a heartbeat extends its visibility, so a long job isn't delivered again, and renews its lease, so
 * a duplicate delivery can't take it over. A heartbeat that fails at either, or finds the lease lost, stops the job,
 * since another worker may have it. A job that rejects is
 * released, and comes back after `retryDelayMs`, until the queue moves it to its dead-letter queue. On a FIFO queue,
 * jobs of one group run in order, and other groups aren't held up.
 *
 * @param options - Queue, store, handler and timings
 * @returns `poll()` to receive once, and `run()` to receive until stopped
 * @throws {WorkerOptionError} When `leaseMs` isn't more than the heartbeat's interval, or the store has no `renew`
 */
export const createWorker = ({
    sqs,
    queueUrl,
    store,
    handle,
    visibilityTimeoutMs,
    leaseMs,
    ttlMs = defaultTtlMs,
    retryDelayMs = defaultRetryDelayMs,
    waitTimeMs = defaultWaitTimeMs,
    maxMessages = defaultMaxMessages,
}: WorkerOptions): Worker => {
    const heartbeatMs = visibilityTimeoutMs / heartbeatsPerTimeout;
    if (leaseMs <= heartbeatMs) {
        throw new WorkerOptionError(
            'leaseMs',
            `${leaseMs} must be more than the heartbeat's interval (${heartbeatMs}), or a lease runs out before it is renewed`
        );
    }
    if (!store.renew) {
        throw new WorkerOptionError(
            'store',
            'it has no renew, so a heartbeat could not renew a lease'
        );
    }
    // `waitMs: 0`: a delivery of a running job isn't held, it comes back later
    const keys = new IdempotencyKeys({ store, leaseMs, ttlMs, waitMs: 0 });
    const scope = queueUrl.slice(queueUrl.lastIndexOf('/') + 1);

    const setVisibility = async (message: Message, ms: number): Promise<void> => {
        await sqs.changeMessageVisibility({
            QueueUrl: queueUrl,
            ReceiptHandle: message.ReceiptHandle,
            VisibilityTimeout: toSeconds(ms),
        });
    };

    const runJob = async (
        message: Message,
        job: ReceivedJob,
        attempt: IdempotencyAttempt
    ): Promise<void> => {
        const controller = new AbortController();
        const extend = async (): Promise<void> => {
            try {
                await setVisibility(message, visibilityTimeoutMs);
            } catch (error) {
                // Visible again, so another worker may receive it: the job stops rather than race it
                controller.abort(error);
            }
        };
        const renew = async (): Promise<void> => {
            try {
                if (!(await attempt.renew())) {
                    // Taken over by another delivery, which may be running the job
                    controller.abort(new JobLeaseLostError(job.id));
                }
            } catch (error) {
                // Not renewed, so the lease may run out before the next heartbeat: the job stops rather than race
                controller.abort(error);
            }
        };
        // Cleared once the handler ends, which it should soon after its signal aborts
        const heartbeat = setInterval(() => {
            if (controller.signal.aborted) {
                return;
            }
            void extend();
            void renew();
        }, heartbeatMs);
        try {
            await handle(job, controller.signal);
        } finally {
            clearInterval(heartbeat);
        }
    };

    const process = async (message: Message): Promise<JobResult> => {
        const messageId = message.MessageId!;
        const receiveCount = Number(message.Attributes!.ApproximateReceiveCount);
        const retry = async (
            outcome: JobOutcome,
            jobId: string | null,
            error?: unknown
        ): Promise<JobResult> => {
            await setVisibility(message, retryDelayMs(receiveCount));
            return error === undefined
                ? { messageId, jobId, outcome }
                : { messageId, jobId, outcome, error };
        };

        const body = message.Body!;
        const job = decodeJob(body);
        if (!job) {
            return retry('invalid', null);
        }
        const result = await keys.begin({
            scope,
            operation: 'run',
            key: job.id,
            fingerprint: fingerprintBody(body),
        });
        if (result.outcome === 'conflict') {
            return retry('busy', job.id);
        }
        if (result.outcome === 'mismatch') {
            return retry('reused', job.id);
        }
        if (result.outcome === 'run') {
            try {
                await runJob(message, { ...job, receiveCount }, result.attempt);
            } catch (error) {
                await result.attempt.release();
                return retry('failed', job.id, error);
            }
            await result.attempt.respond(ranResponse);
        }
        await sqs.deleteMessage({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle });
        return {
            messageId,
            jobId: job.id,
            outcome: result.outcome === 'run' ? 'done' : 'duplicate',
        };
    };

    /**
     * Runs a group's messages in order. Once one doesn't finish, the rest are made visible at once, which on a FIFO
     * queue delivers them only after the one that didn't (a group with a message in flight delivers nothing).
     *
     * @param messages - One group's messages, in the order received
     * @returns What became of each
     */
    const processGroup = async (messages: readonly Message[]): Promise<JobResult[]> => {
        const results: JobResult[] = [];
        for (const message of messages) {
            const isBlocked = results.some(
                ({ outcome }) => outcome !== 'done' && outcome !== 'duplicate'
            );
            if (isBlocked) {
                await setVisibility(message, 0);
                results.push({
                    messageId: message.MessageId!,
                    jobId: null,
                    outcome: 'deferred',
                });
            } else {
                results.push(await process(message));
            }
        }
        return results;
    };

    const poll = async (signal?: AbortSignal): Promise<JobResult[]> => {
        let messages: Message[];
        try {
            ({ Messages: messages = [] } = await sqs.receiveMessage(
                {
                    QueueUrl: queueUrl,
                    MaxNumberOfMessages: maxMessages,
                    WaitTimeSeconds: toSeconds(waitTimeMs),
                    MessageSystemAttributeNames: ['ApproximateReceiveCount', 'MessageGroupId'],
                },
                signal ? { abortSignal: signal } : {}
            ));
        } catch (error) {
            if (signal?.aborted === true) {
                return [];
            }
            throw error;
        }
        // Each message of a standard queue is a group of its own
        const groups = Map.groupBy(
            messages,
            message => message.Attributes?.MessageGroupId ?? message.MessageId
        );
        const groupResults = await Promise.all(
            groups.values().map(async group => processGroup(group))
        );
        const results = groupResults.flat();
        const order = new Map(messages.map((message, index) => [message.MessageId, index]));
        return results.toSorted((a, b) => order.get(a.messageId)! - order.get(b.messageId)!);
    };

    return {
        poll,
        run: async signal => {
            while (!signal.aborted) {
                await poll(signal);
            }
        },
    };
};
