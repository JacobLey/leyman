import type { Middleware, Send } from './compose.js';

export interface Credentials {
    /**
     * The token to send, called before each request: the place to renew a token that has expired.
     */
    readonly token: () => Promise<string>;
    /**
     * A token to send instead of one the API refused, or `null` when there is none and the refusal stands.
     * Requests refused the same token at the same time wait for the same call.
     */
    readonly renew: (refused: string) => Promise<string | null>;
}

export interface BearerOptions {
    /**
     * The statuses that mean the token was refused, and a renewed one may be accepted.
     *
     * @default 401
     */
    readonly refusedStatuses?: ReadonlySet<number> | undefined;
}

const sendWith = async (next: Send, request: Request, token: string): Promise<Response> => {
    const headers = new Headers(request.headers);
    headers.set('authorization', `Bearer ${token}`);
    return next(new Request(request, { headers }));
};

/**
 * Sends each request with a bearer token (RFC 6750), and sends it once more with a renewed token when the API
 * refuses the first.
 *
 * @param credentials - The token, and how to renew it
 * @param options - Which statuses are a refusal
 * @returns The middleware
 */
export const bearer = (credentials: Credentials, options: BearerOptions = {}): Middleware => {
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- HTTP status
    const refusedStatuses = options.refusedStatuses ?? new Set([401]);
    const renewals = new Map<string, Promise<string | null>>();
    const renew = async (refused: string): Promise<string | null> => {
        let renewal = renewals.get(refused);
        if (!renewal) {
            renewal = (async () => {
                try {
                    return await credentials.renew(refused);
                } finally {
                    renewals.delete(refused);
                }
            })();
            renewals.set(refused, renewal);
        }
        return renewal;
    };
    return next => async request => {
        const token = await credentials.token();
        const response = await sendWith(next, request.clone(), token);
        if (!refusedStatuses.has(response.status)) {
            return response;
        }
        const renewed = await renew(token);
        if (renewed === null) {
            return response;
        }
        await response.body?.cancel();
        return sendWith(next, request, renewed);
    };
};
