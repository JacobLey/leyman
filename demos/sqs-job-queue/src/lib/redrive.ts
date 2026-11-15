import type {
    ListMessageMoveTasksCommandInput,
    ListMessageMoveTasksCommandOutput,
    StartMessageMoveTaskCommandInput,
    StartMessageMoveTaskCommandOutput,
} from '@aws-sdk/client-sqs';
import { setTimeout } from 'node:timers/promises';
import { RedriveError } from './errors.js';

/**
 * The methods {@link redriveDeadLetters} needs from `SQS` of `@aws-sdk/client-sqs`, which fits as is.
 */
export interface RedriveSqs {
    startMessageMoveTask: (
        input: StartMessageMoveTaskCommandInput
    ) => Promise<StartMessageMoveTaskCommandOutput>;
    listMessageMoveTasks: (
        input: ListMessageMoveTasksCommandInput
    ) => Promise<ListMessageMoveTasksCommandOutput>;
}

export interface RedriveOptions {
    /**
     * The dead-letter queue to empty.
     */
    readonly deadLetterArn: string;
    /**
     * How often to check on the move task, in milliseconds.
     *
     * @default 1000
     */
    readonly pollMs?: number;
}

const defaultPollMs = 1000;

/**
 * Sends a dead-letter queue's messages back to the queues they came from, once what made them fail is fixed. SQS
 * moves them in the background, so this waits for the move task to end.
 *
 * On AWS, each message comes back as a new one, with a new `MessageId` and its receive count starting over, which is
 * why the worker keys jobs by their own id.
 *
 * @param sqs - Client
 * @param options - Dead-letter queue and poll interval
 * @returns How many messages were moved
 * @rejects {RedriveError} When the task fails or is cancelled
 */
export const redriveDeadLetters = async (
    sqs: RedriveSqs,
    { deadLetterArn, pollMs = defaultPollMs }: RedriveOptions
): Promise<number> => {
    await sqs.startMessageMoveTask({ SourceArn: deadLetterArn });
    for (;;) {
        // A queue runs one move task at a time, so the newest is the one just started. Only a running task is listed
        // with its handle, so the handle can't identify it:
        // https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ListMessageMoveTasksResultEntry.html
        const { Results: tasks = [] } = await sqs.listMessageMoveTasks({
            SourceArn: deadLetterArn,
            MaxResults: 1,
        });
        const [task] = tasks;
        if (!task) {
            throw new RedriveError('MISSING', 'no move task is listed');
        }
        const { Status: status = 'UNKNOWN' } = task;
        if (status === 'COMPLETED') {
            return task.ApproximateNumberOfMessagesMoved!;
        }
        if (status !== 'RUNNING' && status !== 'CANCELLING') {
            throw new RedriveError(status, task.FailureReason ?? 'no reason given');
        }
        await setTimeout(pollMs);
    }
};
