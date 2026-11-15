import type {
    CreateQueueCommandInput,
    CreateQueueCommandOutput,
    GetQueueAttributesCommandInput,
    GetQueueAttributesCommandOutput,
} from '@aws-sdk/client-sqs';

/**
 * The methods {@link createJobQueue} needs from `SQS` of `@aws-sdk/client-sqs`, which fits as is.
 */
export interface CreateJobQueueSqs {
    createQueue: (input: CreateQueueCommandInput) => Promise<CreateQueueCommandOutput>;
    getQueueAttributes: (
        input: GetQueueAttributesCommandInput
    ) => Promise<GetQueueAttributesCommandOutput>;
}

export interface CreateJobQueueOptions {
    /**
     * The queue's name. A FIFO queue gets `.fifo` added, and the dead-letter queue is `<name>-dead-letter`.
     */
    readonly name: string;
    /**
     * Whether it's a FIFO queue: in order per group, and deduplicated by job id for 5 minutes.
     *
     * @default false
     */
    readonly fifo?: boolean;
    /**
     * How long a received job stays hidden from other workers, rounded up to whole seconds: the retry delay of a
     * worker that crashed. Workers extend it while a job runs, so it needn't cover the longest job.
     */
    readonly visibilityTimeoutMs: number;
    /**
     * Deliveries before a job moves to the dead-letter queue.
     */
    readonly maxReceiveCount: number;
}

/**
 * A queue and its dead-letter queue.
 */
export interface JobQueue {
    readonly queueUrl: string;
    readonly queueArn: string;
    readonly deadLetterUrl: string;
    readonly deadLetterArn: string;
}

const millisecondsPerSecond = 1000;

/**
 * Whether a queue is FIFO, which SQS requires its name to say.
 *
 * @param queueUrl - URL of the queue, which ends in its name
 * @returns `true` for a FIFO queue
 */
export const isFifo = (queueUrl: string): boolean => queueUrl.endsWith('.fifo');

/**
 * Milliseconds as the whole seconds SQS takes, rounded up.
 *
 * @param ms - Duration in milliseconds
 * @returns Whole seconds, at least `ms`
 */
export const toSeconds = (ms: number): number => Math.ceil(ms / millisecondsPerSecond);

/**
 * Creates a queue with a dead-letter queue, which takes a job after `maxReceiveCount` deliveries. A FIFO queue's
 * dead-letter queue is FIFO too, as SQS requires. Creating a queue that exists with the same attributes returns it.
 *
 * @param sqs - Client
 * @param options - Name, kind, visibility timeout and deliveries
 * @returns URLs and ARNs of both queues
 */
export const createJobQueue = async (
    sqs: CreateJobQueueSqs,
    { name, fifo = false, visibilityTimeoutMs, maxReceiveCount }: CreateJobQueueOptions
): Promise<JobQueue> => {
    const suffix = fifo ? '.fifo' : '';
    const fifoAttributes: Record<string, string> = fifo ? { FifoQueue: 'true' } : {};
    const create = async (
        queueName: string,
        attributes: Record<string, string>
    ): Promise<[string, string]> => {
        const { QueueUrl: url } = await sqs.createQueue({
            QueueName: queueName,
            Attributes: { ...fifoAttributes, ...attributes },
        });
        const { Attributes: created } = await sqs.getQueueAttributes({
            QueueUrl: url,
            AttributeNames: ['QueueArn'],
        });
        return [url!, created!.QueueArn!];
    };

    const [deadLetterUrl, deadLetterArn] = await create(`${name}-dead-letter${suffix}`, {});
    const [queueUrl, queueArn] = await create(`${name}${suffix}`, {
        VisibilityTimeout: String(toSeconds(visibilityTimeoutMs)),
        RedrivePolicy: JSON.stringify({ deadLetterTargetArn: deadLetterArn, maxReceiveCount }),
    });
    return { queueUrl, queueArn, deadLetterUrl, deadLetterArn };
};
