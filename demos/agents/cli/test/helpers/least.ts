import type { Served } from './serve.js';
import { listen } from './serve.js';

const token = 'opaque-token';

/**
 * An API that is its own authorization server, and says the least the standards allow: metadata only at OpenID
 * Connect's well-known URL (none at RFC 8414's), no scopes, no `iss` in its authorization responses, and tokens with
 * no expiry and no refresh token. Its `/notes` lists none, for its own token.
 *
 * @returns Where it listens, and how to stop it
 */
export const listenLeast = async (): Promise<Served> => {
    const served = await listen();
    const { url } = served;
    served.use(async request => {
        const { pathname, searchParams } = new URL(request.url);
        switch (pathname) {
            case '/.well-known/oauth-protected-resource': {
                return Response.json({ resource: url, authorization_servers: [url] });
            }
            case '/.well-known/openid-configuration': {
                return Response.json({
                    issuer: url,
                    authorization_endpoint: `${url}/authorize`,
                    token_endpoint: `${url}/token`,
                    response_types_supported: ['code'],
                });
            }
            case '/authorize': {
                // Signs in straight away
                const callback = new URL(searchParams.get('redirect_uri')!);
                callback.searchParams.set('code', 'code');
                callback.searchParams.set('state', searchParams.get('state')!);
                return Response.redirect(callback, 302);
            }
            case '/token': {
                return Response.json({ access_token: token, token_type: 'Bearer' });
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
