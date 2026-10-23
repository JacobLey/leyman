import { DevAuthorizationFlowError } from './errors.js';

/**
 * At most this many redirects from the authorization request to the redirect URI. The dev login takes five
 * (authorize, login, resume, consent, resume).
 */
const maxRedirects = 10;

/**
 * Keeps the cookies a response sets.
 *
 * @param cookies - The browser's, by name
 * @param response - Setting more
 */
const keepCookies = (cookies: Map<string, string>, response: Response): void => {
    for (const cookie of response.headers.getSetCookie()) {
        const [pair = ''] = cookie.split(';', 1);
        const separator = pair.indexOf('=');
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
};

const cookieHeader = (cookies: ReadonlyMap<string, string>): string =>
    Array.from(cookies, ([name, value]) => `${name}=${value}`).join('; ');

export interface FollowAuthorizationOptions {
    /**
     * The browser's cookies, by name, kept across authorizations like a browser profile: a second authorization then
     * resumes the first's session (no login), and extends its grant. Updated as the server sets them.
     *
     * @default a new, empty jar for each authorization
     */
    readonly cookies?: Map<string, string> | undefined;
}

/**
 * Plays the browser for an authorization request to the dev authorization server: follows its redirects, keeping
 * its cookies, until it redirects to the client's redirect URI. That redirect is never fetched, since the client
 * isn't listening for it.
 *
 * @param authorizationUrl - Where the client sends the user, with its `client_id`, PKCE challenge and `resource`
 * @param redirectUri - The client's redirect URI, as registered
 * @param options - The browser's cookies, to keep its session
 * @returns The redirect to it, with `code`, `state` and `iss` (or `error`) in its query
 * @rejects {DevAuthorizationFlowError} When the server answers anything but a redirect, or redirects too often
 */
export const followAuthorization = async (
    authorizationUrl: string | URL,
    redirectUri: string | URL,
    options: FollowAuthorizationOptions = {}
): Promise<URL> => {
    const callback = new URL(redirectUri);
    const { cookies = new Map<string, string>() } = options;
    let url = new URL(authorizationUrl);
    for (let redirects = 0; redirects < maxRedirects; ++redirects) {
        const response = await fetch(url, {
            redirect: 'manual',
            headers: { cookie: cookieHeader(cookies) },
        });
        keepCookies(cookies, response);
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

export interface ApproveDeviceOptions extends FollowAuthorizationOptions {
    /**
     * Plays a user who says the code isn't the one their device shows: the device is then refused
     * (`access_denied`).
     *
     * @default false
     */
    readonly deny?: boolean | undefined;
}

/**
 * A form oidc-provider renders in the device flow (its markup is its own, and fixed): its id, where it posts, and
 * what's in it.
 */
const postForm =
    /<form(?: id="(?<id>[^"]+)")?[^>]* method="post" action="(?<action>[^"]+)">(?<fields>.*?)<\/form>/sv;
const hiddenField = /<input type="hidden" name="(?<name>[^"]+)" value="(?<value>[^"]*)"\/>/gv;

/**
 * Plays the user for the device authorization grant (RFC 8628), on another device: opens the
 * `verification_uri_complete` a device shows, posts the code (as the page's script would), confirms it's the one
 * shown (or says it isn't), and signs in through the dev login, until the server says it's done. The device's next
 * poll then gets its tokens (or is refused).
 *
 * @param verificationUri - The device authorization response's `verification_uri_complete`
 * @param options - The browser's cookies, and whether to deny
 * @rejects {DevAuthorizationFlowError} When the server refuses the code, shows no form, or doesn't finish
 */
export const approveDevice = async (
    verificationUri: string | URL,
    options: ApproveDeviceOptions = {}
): Promise<void> => {
    const { cookies = new Map<string, string>(), deny = false } = options;
    let url = new URL(verificationUri);
    // The form to post next, once a page has one
    let form: URLSearchParams | null = null;
    let hasConfirmed = false;
    for (let requests = 0; requests < maxRedirects; ++requests) {
        const init: RequestInit = {
            redirect: 'manual',
            headers: { cookie: cookieHeader(cookies) },
        };
        if (form) {
            init.method = 'POST';
            init.body = form;
        }
        const response = await fetch(url, init);
        keepCookies(cookies, response);
        form = null;
        const location = response.headers.get('location');
        if (location !== null) {
            url = new URL(location, url);
            continue;
        }
        // After confirming, the page that ends it: signed in, or the device refused
        if (hasConfirmed) {
            return;
        }
        const found = postForm.exec(await response.text())?.groups;
        if (found === undefined) {
            throw new DevAuthorizationFlowError(url, `answered ${response.status}, not a form`);
        }
        // Asked for the code again: it was refused
        if (found.id === 'op.deviceInputForm') {
            throw new DevAuthorizationFlowError(url, 'refused the code');
        }
        form = new URLSearchParams(
            Array.from(found.fields!.matchAll(hiddenField), match => [
                match.groups!.name!,
                match.groups!.value!,
            ])
        );
        if (found.id === 'op.deviceConfirmForm') {
            hasConfirmed = true;
            if (deny) {
                form.set('abort', 'yes');
            }
        }
        url = new URL(found.action!, url);
    }
    throw new DevAuthorizationFlowError(url, `more than ${maxRedirects} redirects`);
};
