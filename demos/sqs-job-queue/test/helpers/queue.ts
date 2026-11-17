import type { SQS } from '@aws-sdk/client-sqs';
import type { JobOutcome, Worker, WorkerSqs } from '@leyman/demo-sqs-job-queue';

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
 * Bodies of the messages visible on a queue, received once with a visibility timeout of 0 so they stay visible. Use it
 * only on a queue no worker holds a message of: each receive gives a new receipt handle, and on AWS a worker must use
 * the latest one.
 *
 * @param sqs - Client to receive with
 * @param queueUrl - URL of the queue to look at
 * @returns Message bodies, in the order received
 */
export const peek = async (sqs: SQS, queueUrl: string): Promise<string[]> => {
    const { Messages: messages = [] } = await sqs.receiveMessage({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        VisibilityTimeout: 0,
    });
    return messages.map(({ Body: body }) => body!);
};

/**
 * Wraps a worker's client to record what it receives and deletes. SQS has no exact count of a queue's messages
 * (`ApproximateNumberOfMessages` is eventually consistent), so a test tells a deleted message from a hidden one by
 * whether the worker deleted it.
 *
 * @param sqs - Client to pass every call through to
 * @returns The seam, and the bodies of messages received and not deleted, in the order received
 */
export const watchDeletes = (
    sqs: WorkerSqs
): { readonly sqs: WorkerSqs; readonly undeleted: () => string[] } => {
    // By message id, as each delivery of a message has its own receipt handle
    const bodies = new Map<string, string>();
    const messageIds = new Map<string, string>();
    return {
        sqs: {
            receiveMessage: async (input, requestOptions) => {
                const output = await sqs.receiveMessage(input, requestOptions);
                const { Messages: messages = [] } = output;
                for (const message of messages) {
                    bodies.set(message.MessageId!, message.Body!);
                    messageIds.set(message.ReceiptHandle!, message.MessageId!);
                }
                return output;
            },
            deleteMessage: async input => {
                const output = await sqs.deleteMessage(input);
                bodies.delete(messageIds.get(input.ReceiptHandle!)!);
                return output;
            },
            changeMessageVisibility: async input => sqs.changeMessageVisibility(input),
        },
        undeleted: () => bodies.values().toArray(),
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
