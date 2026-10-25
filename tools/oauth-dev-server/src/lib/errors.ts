/**
 * Base of every error the dev authorization server's helpers throw.
 */
export abstract class DevAuthorizationError extends Error {}

/**
 * The dev authorization server would be reachable from other machines: it approves every login, so it must never be,
 * unless asked for knowingly.
 */
export class DevAuthorizationServerNotLocalError extends DevAuthorizationError {
    public readonly hostname: string;
    public constructor(hostname: string) {
        super(
            `${hostname} is not this machine: the dev authorization server approves every login, so it only serves ` +
                'locally, unless `dangerouslyAllowNonLocal` is set'
        );
        this.name = 'DevAuthorizationServerNotLocalError';
        this.hostname = hostname;
    }
}

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
