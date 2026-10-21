/**
 * Base of every error the client throws.
 */
export abstract class NotesClientError extends Error {}

/**
 * The server answered with a status the spec doesn't document for the operation.
 */
export class NotesClientUnexpectedStatusError extends NotesClientError {
    public readonly operationId: string;
    public readonly status: number;
    public constructor(operationId: string, status: number) {
        super(`${operationId} answered ${status}, which the spec does not document`);
        this.name = 'NotesClientUnexpectedStatusError';
        this.operationId = operationId;
        this.status = status;
    }
}
