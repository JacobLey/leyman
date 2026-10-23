/**
 * Base of every error the MCP server throws.
 */
export abstract class NotesMcpError extends Error {}

/**
 * The authorization server can't be used: its discovery document is missing or wrong, or it refused the server's
 * own credentials.
 */
export class NotesMcpAuthorizationServerError extends NotesMcpError {
    public readonly issuer: string;
    public constructor(issuer: string, reason: string) {
        super(`Authorization server ${issuer}: ${reason}`);
        this.name = 'NotesMcpAuthorizationServerError';
        this.issuer = issuer;
    }
}

/**
 * The notes API answered in a way no tool can recover from (e.g. it refused the server's own token). The agent is
 * told only that the service failed; this is what's reported.
 */
export class NotesMcpApiError extends NotesMcpError {
    public readonly operationId: string;
    public readonly status: number;
    public constructor(operationId: string, status: number) {
        super(`The notes API answered ${operationId} with ${status}`);
        this.name = 'NotesMcpApiError';
        this.operationId = operationId;
        this.status = status;
    }
}
