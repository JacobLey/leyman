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
 * A job that ran into its lease, so the worker stopped it: past the lease, a duplicate delivery could run it again.
 * The handler's `signal` is aborted with it.
 */
export class JobLeaseExpiredError extends JobQueueError {
    public readonly jobId: string;
    public constructor(jobId: string) {
        super(`Job ${jobId} ran into its lease`);
        this.name = 'JobLeaseExpiredError';
        this.jobId = jobId;
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
