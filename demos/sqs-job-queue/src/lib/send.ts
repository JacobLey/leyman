import type {
    SendMessageBatchCommandInput,
    SendMessageBatchCommandOutput,
    SendMessageBatchRequestEntry,
} from '@aws-sdk/client-sqs';
import type { SendFailure } from './errors.js';
import type { Job } from './job.js';
import { MissingGroupError, SendJobsError } from './errors.js';
import { encodeJob } from './job.js';
import { isFifo } from './queue.js';

/**
 * The method {@link sendJobs} needs from `SQS` of `@aws-sdk/client-sqs`, which fits as is.
 */
export interface SendJobsSqs {
    sendMessageBatch: (
        input: SendMessageBatchCommandInput
    ) => Promise<SendMessageBatchCommandOutput>;
}

export interface SendJobsOptions {
    readonly queueUrl: string;
    /**
     * Attempts for a job SQS fails through no fault of the sender, such as an internal error.
     *
     * @default 3
     */
    readonly maxAttempts?: number;
}

/**
 * SQS takes at most 10 messages per batch.
 */
const batchSize = 10;
const defaultMaxAttempts = 3;

/**
 * Sends jobs in batches of 10. A batch answers `200` even when some of its messages fail, so each failure is read
 * from `Failed`: one that's the sender's fault fails at once, and any other is sent again, up to `maxAttempts`.
 *
 * On a FIFO queue, each job is sent in its `group`, deduplicated by its id: SQS drops a job sent again within 5
 * minutes, and answers with the first send's `MessageId`.
 *
 * @param sqs - Client
 * @param options - Queue and attempts
 * @param jobs - Jobs to send
 * @rejects {MissingGroupError} When a job sent to a FIFO queue has no group, before anything is sent
 * @rejects {SendJobsError} When jobs failed, after every other job was sent
 */
export const sendJobs = async (
    sqs: SendJobsSqs,
    { queueUrl, maxAttempts = defaultMaxAttempts }: SendJobsOptions,
    jobs: readonly Job[]
): Promise<void> => {
    const isFifoQueue = isFifo(queueUrl);
    const entries = jobs.map((job, index): SendMessageBatchRequestEntry => {
        const entry = { Id: String(index), MessageBody: encodeJob(job) };
        if (!isFifoQueue) {
            return entry;
        }
        if (job.group === undefined) {
            throw new MissingGroupError(job.id);
        }
        return { ...entry, MessageGroupId: job.group, MessageDeduplicationId: job.id };
    });

    const failed: SendFailure[] = [];
    let pending = entries;
    let attempt = 0;
    while (pending.length > 0) {
        attempt++;
        const retry: SendMessageBatchRequestEntry[] = [];
        for (let start = 0; start < pending.length; start += batchSize) {
            const batch = pending.slice(start, start + batchSize);
            const { Failed: batchFailed = [] } = await sqs.sendMessageBatch({
                QueueUrl: queueUrl,
                Entries: batch,
            });
            for (const { Id: id, Code: code, SenderFault: senderFault } of batchFailed) {
                const entry = batch.find(({ Id: entryId }) => entryId === id)!;
                if (senderFault !== true && attempt < maxAttempts) {
                    retry.push(entry);
                } else {
                    failed.push({
                        jobId: jobs[Number(id)]!.id,
                        code: code!,
                        senderFault: senderFault === true,
                    });
                }
            }
        }
        pending = retry;
    }
    if (failed.length > 0) {
        throw new SendJobsError(failed);
    }
};
