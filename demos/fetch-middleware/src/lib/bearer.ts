import type { Middleware, Send } from './compose.js';

export interface Credentials {
    /**
     * The token to send, called before each request: the place to renew a token that has expired.
     */
    readonly token: () => Promise<string>;
    /**
     * A token to send instead of one the API refused, or `null` when there is none and the refusal stands.
     * Called once for every request refused the same token, during the call and after: they all send the token it
     * gives. A call that rejects or gives `null` isn't kept, so the next refusal of that token calls it again.
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
 * refuses the first. Every refusal of the same token sends the token one renewal gave, so a burst of refusals
 * renews once, however their responses are spread out.
 *
 * @param credentials - The token, and how to renew it
 * @param options - Which statuses are a refusal
 * @returns The middleware
 */
export const bearer = (credentials: Credentials, options: BearerOptions = {}): Middleware => {
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- HTTP status
    const refusedStatuses = options.refusedStatuses ?? new Set([401]);
    // Only the latest renewal is kept, so memory stays constant. A refusal of a token older than its `refused` is
    // of a request sent before that renewal began, rare enough to renew for itself.
    let latest: { readonly refused: string; readonly renewed: Promise<string | null> } | null =
        null;
    const renew = async (refused: string): Promise<string | null> => {
        if (latest?.refused !== refused) {
            const renewal = { refused, renewed: Promise.try(credentials.renew, refused) };
            latest = renewal;
            const forget = (): void => {
                if (latest === renewal) {
                    latest = null;
                }
            };
            void renewal.renewed
                .then(renewed => {
                    if (renewed === null) {
                        forget();
                    }
                })
                .catch(forget);
        }
        return latest.renewed;
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
