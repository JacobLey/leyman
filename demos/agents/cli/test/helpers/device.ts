import type { Served } from './serve.js';
import { listen } from './serve.js';

const token = 'device-token';

/**
 * An API that is its own authorization server, for device logins only. Its token endpoint answers each poll with
 * the next of `answers`, to test what the dev server never says (`slow_down`), or an answer that isn't OAuth. Its
 * device authorization gives no `verification_uri_complete`, so the user would type the code.
 *
 * @param answers - The token endpoint's, one per poll
 * @param interval - Seconds between polls, as its device authorization says. None said means RFC 8628's 5
 * @returns Where it listens, and how to stop it
 */
export const listenDevice = async (
    answers: readonly Response[],
    interval?: number
): Promise<Served> => {
    const served = await listen();
    const { url } = served;
    let polls = 0;
    served.use(async request => {
        const { pathname } = new URL(request.url);
        switch (pathname) {
            case '/.well-known/oauth-protected-resource': {
                return Response.json({ resource: url, authorization_servers: [url] });
            }
            case '/.well-known/oauth-authorization-server': {
                return Response.json({
                    issuer: url,
                    token_endpoint: `${url}/token`,
                    device_authorization_endpoint: `${url}/device/auth`,
                });
            }
            case '/device/auth': {
                return Response.json({
                    device_code: 'device-code',
                    user_code: 'WDJB-MJHT',
                    verification_uri: `${url}/device`,
                    expires_in: 60,
                    interval,
                });
            }
            case '/token': {
                const answer = answers[polls]!;
                ++polls;
                return answer;
            }
            case '/notes': {
                return request.headers.get('authorization') === `Bearer ${token}`
                    ? Response.json({ items: [] })
                    : Response.json({ message: 'Unknown token' }, { status: 401 });
            }
            default: {
                return new Response(null, { status: 404 });
            }
        }
    });
    return served;
};

/**
 * The token endpoint's answer once the user approves.
 *
 * @returns The answer
 */
export const deviceTokens = (): Response =>
    Response.json({ access_token: token, token_type: 'Bearer', expires_in: 600 });

/**
 * An OAuth error from the token endpoint, e.g. `authorization_pending` or `slow_down`.
 *
 * @param error - Its code
 * @returns The answer
 */
export const deviceError = (error: string): Response => Response.json({ error }, { status: 400 });
