import { createHash } from 'node:crypto';

/**
 * A job, as a producer sends it.
 */
export interface Job {
    /**
     * Assigned by the producer, and the same every time it sends the job: the worker runs each id once. Never SQS's
     * `MessageId`, which a producer's retry and a redrive change.
     */
    readonly id: string;
    /**
     * What kind of job it is, for the handler to dispatch on.
     */
    readonly type: string;
    /**
     * Anything JSON can hold.
     */
    readonly payload: unknown;
    /**
     * On a FIFO queue, the group it runs in order with (`MessageGroupId`). Required there, ignored elsewhere.
     */
    readonly group?: string;
}

/**
 * A job as the worker hands it to the handler.
 */
export interface ReceivedJob {
    readonly id: string;
    readonly type: string;
    readonly payload: unknown;
    /**
     * How many times SQS has delivered it (`ApproximateReceiveCount`), this one included.
     */
    readonly receiveCount: number;
}

/**
 * The message body of a job: everything but its group, which SQS carries itself.
 *
 * @param job - Job to send
 * @returns JSON body
 */
export const encodeJob = ({ id, type, payload }: Job): string =>
    JSON.stringify({ id, type, payload });

/**
 * Reads a job back from a message body.
 *
 * @param body - Message body
 * @returns The job, or `null` when the body isn't one
 */
export const decodeJob = (body: string): Omit<Job, 'group'> | null => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        return null;
    }
    if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'id' in parsed &&
        'type' in parsed &&
        typeof parsed.id === 'string' &&
        typeof parsed.type === 'string' &&
        parsed.id !== '' &&
        parsed.type !== ''
    ) {
        return {
            id: parsed.id,
            type: parsed.type,
            payload: 'payload' in parsed ? parsed.payload : undefined,
        };
    }
    return null;
};

/**
 * What idempotency-keys compares to tell a duplicate from a reused id: the SHA-256 of the body.
 *
 * @param body - Message body
 * @returns Hex digest
 */
export const fingerprintBody = (body: string): string =>
    createHash('sha256').update(body).digest('hex');
