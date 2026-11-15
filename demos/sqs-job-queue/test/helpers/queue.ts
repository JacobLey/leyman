import type { SQS } from '@aws-sdk/client-sqs';
import type { JobOutcome, Worker } from '@leyman/demo-sqs-job-queue';

/**
 * Receives everything visible on a queue, hiding it for 30 seconds, by receiving until a receive comes back empty.
 *
 * @param sqs - Client to receive with
 * @param queueUrl - URL of the queue to empty
 * @returns Message bodies, in the order received
 */
export const drain = async (sqs: SQS, queueUrl: string): Promise<string[]> => {
    const bodies: string[] = [];
    for (;;) {
        const { Messages: messages = [] } = await sqs.receiveMessage({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            VisibilityTimeout: 30,
        });
        if (messages.length === 0) {
            return bodies;
        }
        bodies.push(...messages.map(({ Body: body }) => body!));
    }
};

/**
 * How many messages a queue holds, visible or in flight. The emulator counts exactly, where AWS approximates.
 *
 * @param sqs - Client to ask with
 * @param queueUrl - URL of the queue to count
 * @returns Visible and in-flight counts
 */
export const countMessages = async (
    sqs: SQS,
    queueUrl: string
): Promise<{ readonly visible: number; readonly inFlight: number }> => {
    const { Attributes: attributes } = await sqs.getQueueAttributes({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
    });
    return {
        visible: Number(attributes!.ApproximateNumberOfMessages),
        inFlight: Number(attributes!.ApproximateNumberOfMessagesNotVisible),
    };
};

/**
 * Polls once, keeping only what a test can assert exactly: message ids are random.
 *
 * @param worker - Worker to poll
 * @returns Job id and outcome of each message, in the order received
 */
export const pollJobs = async (
    worker: Worker
): Promise<{ readonly jobId: string | null; readonly outcome: JobOutcome }[]> => {
    const results = await worker.poll();
    return results.map(({ jobId, outcome }) => ({ jobId, outcome }));
};

/**
 * Polls once, keeping only the outcomes.
 *
 * @param worker - Worker to poll
 * @returns Outcome of each message, in the order received
 */
export const pollOutcomes = async (worker: Worker): Promise<JobOutcome[]> => {
    const results = await worker.poll();
    return results.map(({ outcome }) => outcome);
};
