/**
 * Base of every error the server throws.
 */
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

/**
 * The authorization server can't be trusted for tokens: its discovery document is missing, or wrong.
 */
export class NotesAuthorizationServerError extends NotesServerError {
    public readonly issuer: string;
    public constructor(issuer: string, reason: string) {
        super(`Authorization server ${issuer}: ${reason}`);
        this.name = 'NotesAuthorizationServerError';
        this.issuer = issuer;
    }
}
