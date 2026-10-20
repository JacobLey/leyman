/**
 * Base of every error the server throws.
 */
// eslint-disable-next-line unicorn/custom-error-definition
export abstract class NotesServerError extends Error {}

/**
 * A handler answered with something the spec doesn't allow. The client gets a 500 instead, never a response that
 * breaks the contract.
 */
export class NotesResponseError extends NotesServerError {
    public readonly operationId: string;
    public readonly status: number;
    public constructor(operationId: string, status: number, reason: string) {
        super(`${operationId} answered ${status}, which the spec does not allow: ${reason}`);
        this.name = 'NotesResponseError';
        this.operationId = operationId;
        this.status = status;
    }
}
