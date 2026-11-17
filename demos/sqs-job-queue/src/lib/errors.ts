/**
 * Base of every error the job queue throws.
 */
export abstract class JobQueueError extends Error {}

/**
 * A failure as the error's message lists it.
 *
 * @param failure - Job and code
 * @returns `<job id> (<code>)`
 */
const describeFailure = ({ jobId, code }: SendFailure): string => `${jobId} (${code})`;

/**
 * A job that can't be sent: SQS refused it as the sender's fault (such as a body with characters SQS doesn't allow),
 * or it failed through no fault of the sender on every attempt.
 */
export class SendJobsError extends JobQueueError {
    public readonly failed: readonly SendFailure[];
    public constructor(failed: readonly SendFailure[]) {
        super(`Failed to send jobs: ${failed.map(failure => describeFailure(failure)).join(', ')}`);
        this.name = 'SendJobsError';
        this.failed = failed;
    }
}

/**
 * One job SQS didn't accept, with its reason.
 */
export interface SendFailure {
    readonly jobId: string;
    readonly code: string;
    readonly senderFault: boolean;
}

/**
 * A job without a `group`, sent to a FIFO queue, where every message needs one.
 */
export class MissingGroupError extends JobQueueError {
    public readonly jobId: string;
    public constructor(jobId: string) {
        super(`Job ${jobId} has no group, which a FIFO queue needs`);
        this.name = 'MissingGroupError';
        this.jobId = jobId;
    }
}

/**
 * A job whose idempotency lease a heartbeat couldn't renew because the job no longer holds its key: another delivery
 * took it over once the lease ran out (or the key expired), so it may be running the job. The worker stops the job,
 * aborting the handler's `signal` with this error.
 */
export class JobLeaseLostError extends JobQueueError {
    public readonly jobId: string;
    public constructor(jobId: string) {
        super(`Job ${jobId} lost its lease to another delivery`);
        this.name = 'JobLeaseLostError';
        this.jobId = jobId;
    }
}

/**
 * A worker option that can't work: a `leaseMs` that a heartbeat can't renew in time, or a store without
 * idempotency-keys' optional `renew`.
 */
export class WorkerOptionError extends JobQueueError {
    public readonly option: string;
    public constructor(option: string, reason: string) {
        super(`Invalid worker option ${option}: ${reason}`);
        this.name = 'WorkerOptionError';
        this.option = option;
    }
}

/**
 * A redrive that didn't complete: the move task failed or was cancelled, with SQS's reason.
 */
export class RedriveError extends JobQueueError {
    public readonly status: string;
    public constructor(status: string, reason: string) {
        super(`Redrive ended ${status}: ${reason}`);
        this.name = 'RedriveError';
        this.status = status;
    }
}
