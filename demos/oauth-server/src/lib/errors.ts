/**
 * Base of every error the dev authorization server's helpers throw.
 */
export abstract class DevAuthorizationError extends Error {}

/**
 * The dev authorization flow didn't reach the client's redirect URI.
 */
export class DevAuthorizationFlowError extends DevAuthorizationError {
    /**
     * The last URL fetched.
     */
    public readonly url: string;
    public constructor(url: URL, reason: string) {
        super(`${url.pathname}: ${reason}`);
        this.name = 'DevAuthorizationFlowError';
        this.url = url.href;
    }
}
