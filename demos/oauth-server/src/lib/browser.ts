import { DevAuthorizationFlowError } from './errors.js';

/**
 * At most this many redirects from the authorization request to the redirect URI. The dev login takes five
 * (authorize, login, resume, consent, resume).
 */
const maxRedirects = 10;

/**
 * Plays the browser for an authorization request to the dev authorization server: follows its redirects, keeping
 * its cookies, until it redirects to the client's redirect URI. That redirect is never fetched, since the client
 * isn't listening for it.
 *
 * @param authorizationUrl - Where the client sends the user, with its `client_id`, PKCE challenge and `resource`
 * @param redirectUri - The client's redirect URI, as registered
 * @returns The redirect to it, with `code`, `state` and `iss` (or `error`) in its query
 * @rejects {DevAuthorizationFlowError} When the server answers anything but a redirect, or redirects too often
 */
export const followAuthorization = async (
    authorizationUrl: string | URL,
    redirectUri: string | URL
): Promise<URL> => {
    const callback = new URL(redirectUri);
    const cookies = new Map<string, string>();
    let url = new URL(authorizationUrl);
    for (let redirects = 0; redirects < maxRedirects; ++redirects) {
        const response = await fetch(url, {
            redirect: 'manual',
            headers: {
                cookie: Array.from(cookies, ([name, value]) => `${name}=${value}`).join('; '),
            },
        });
        for (const cookie of response.headers.getSetCookie()) {
            const [pair = ''] = cookie.split(';', 1);
            const separator = pair.indexOf('=');
            cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
        }
        const location = response.headers.get('location');
        if (location === null) {
            throw new DevAuthorizationFlowError(url, `answered ${response.status}, not a redirect`);
        }
        url = new URL(location, url);
        if (url.origin === callback.origin && url.pathname === callback.pathname) {
            return url;
        }
    }
    throw new DevAuthorizationFlowError(url, `more than ${maxRedirects} redirects`);
};
