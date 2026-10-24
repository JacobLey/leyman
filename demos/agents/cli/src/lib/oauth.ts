import type { AddressInfo } from 'node:net';
import type { Session } from './session.js';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import * as oauth from 'oauth4webapi';
import { NotesCliError, NotesCliLoginError } from './errors.js';

/**
 * How long any request the CLI makes (discovery, tokens, the API) waits for an answer.
 */
export const requestTimeoutMs = 10_000;

/**
 * `oauth4webapi`'s options for a request: it times out, and plain HTTP is allowed only to this machine (a local API
 * or authorization server). Anywhere else must be HTTPS.
 *
 * @param url - Where the request goes
 * @returns The options
 */
/* eslint-disable @typescript-eslint/no-deprecated, sonarjs/deprecation -- Deprecated to stand out: only for here */
const requestOptions = (
    url: URL
): { readonly signal: AbortSignal; readonly [oauth.allowInsecureRequests]: boolean } => ({
    signal: AbortSignal.timeout(requestTimeoutMs),
    [oauth.allowInsecureRequests]: ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname),
});
/* eslint-enable @typescript-eslint/no-deprecated, sonarjs/deprecation */

/**
 * An access token is refreshed this many seconds before it expires (or half its life, if shorter), so it doesn't
 * expire on its way to the API.
 */
const expiryMarginSeconds = 30;

const millisecondsPerSecond = 1000;

const statusOk = 200;
const statusNotFound = 404;

/**
 * An authorization server's metadata, checked to be the issuer's own: at RFC 8414's well-known URL, else OpenID
 * Connect's (which providers like Keycloak serve instead), in the order the MCP spec gives.
 *
 * @param issuer - Its issuer identifier
 * @returns Its metadata
 */
const discoverAuthorizationServer = async (issuer: URL): Promise<oauth.AuthorizationServer> => {
    const request = async (algorithm: 'oauth2' | 'oidc'): Promise<Response> =>
        oauth.discoveryRequest(issuer, { algorithm, ...requestOptions(issuer) });
    let response = await request('oauth2');
    if (response.status === statusNotFound) {
        response = await request('oidc');
    }
    return oauth.processDiscoveryResponse(issuer, response);
};

interface Discovered {
    /**
     * The API's identifier, as it says it (RFC 9728), for the `resource` of its tokens (RFC 8707).
     */
    readonly resource: string;
    readonly authorizationServer: oauth.AuthorizationServer;
    /**
     * The scopes it names, if it names any.
     */
    readonly scopes: readonly string[];
}

/**
 * Finds who issues the API's tokens, from the API alone: its Protected Resource Metadata (RFC 9728) gives the
 * authorization server and the scopes, and the server's metadata its endpoints. Both are checked to be about what
 * was asked for.
 *
 * @param api - The API's URL
 * @returns Its identifier, its authorization server, and the scopes it understands
 * @rejects {NotesCliError} When the API or its authorization server doesn't say
 */
const discover = async (api: URL): Promise<Discovered> => {
    try {
        const metadata = await oauth.processResourceDiscoveryResponse(
            api,
            await oauth.resourceDiscoveryRequest(api, requestOptions(api))
        );
        // Validated by oauth4webapi: a non-empty list of URLs
        const issuer = new URL(metadata.authorization_servers![0]!);
        return {
            authorizationServer: await discoverAuthorizationServer(issuer),
            resource: metadata.resource,
            scopes: metadata.scopes_supported ?? [],
        };
    } catch (error) {
        throw new NotesCliError(
            `${api.href} doesn't say how to log in (${(error as Error).message}). Is it the notes API?`
        );
    }
};

/**
 * The session for a token response.
 *
 * @param base - Where the API is, its issuer, the client, and the refresh token so far
 * @param tokens - The token endpoint's response
 * @returns The session to keep
 */
const toSession = (
    base: Pick<Session, 'api' | 'clientId' | 'issuer' | 'refreshToken'>,
    tokens: oauth.TokenEndpointResponse
): Session => ({
    api: base.api,
    issuer: base.issuer,
    clientId: base.clientId,
    accessToken: tokens.access_token,
    // None from a server that issues none, or that doesn't rotate them (then the one so far stays good)
    refreshToken: tokens.refresh_token ?? base.refreshToken,
    // A server needn't say when it expires (RFC 6749 §5.1): then it's used until the API refuses it
    expiresAt:
        tokens.expires_in === undefined
            ? null
            : Date.now() +
              (tokens.expires_in - Math.min(expiryMarginSeconds, tokens.expires_in / 2)) *
                  millisecondsPerSecond,
});

/**
 * Waits for the browser to come back to a loopback redirect URI (RFC 8252), on a free port of this machine.
 *
 * @param use - Called with the redirect URI, once listening: starts the authorization
 * @param timeoutSeconds - How long to wait for the browser
 * @returns Where the browser came back to, with the authorization's result in its query
 * @rejects {NotesCliLoginError} When the browser doesn't come back in time
 */
const awaitRedirect = async (
    use: (redirectUri: string) => Promise<void>,
    timeoutSeconds: number
): Promise<URL> => {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const callback = new Promise<URL>((resolve, reject) => {
            // Never forever: a login nobody finishes ends, and frees its port
            timer = setTimeout(() => {
                reject(
                    new NotesCliLoginError(
                        `Login timed out after ${timeoutSeconds}s. Run notes login again.`
                    )
                );
            }, timeoutSeconds * millisecondsPerSecond);
            server.on('request', (request, response) => {
                const url = new URL(request.url!, redirectUri);
                if (url.pathname !== '/callback') {
                    response.writeHead(statusNotFound).end();
                    return;
                }
                response
                    .writeHead(statusOk, { 'content-type': 'text/plain' })
                    .end('Done. You can close this tab.');
                resolve(url);
            });
        });
        await use(redirectUri);
        return await callback;
    } finally {
        clearTimeout(timer);
        server.close();
        server.closeAllConnections();
    }
};

export interface LoginOptions {
    readonly api: string;
    readonly clientId: string;
    /**
     * Sends the user to the authorization URL: a browser, or a message saying where to go.
     */
    readonly openBrowser: (url: URL) => Promise<void>;
    /**
     * How long to wait for the user to finish in the browser, in seconds.
     */
    readonly timeoutSeconds: number;
}

/**
 * Logs in with the authorization code flow, as a native app: PKCE, a loopback redirect, `state`, the `iss` the
 * response must come from (RFC 9207), and a token for the API alone (`resource`, RFC 8707). Asks for every scope the
 * API names, as the CLI can do whatever its user may (or none, for the server's default, when it names none).
 *
 * @param options - The API, the client, and how to reach the user
 * @returns The session
 * @rejects {NotesCliError} When the API doesn't say how to log in
 * @rejects {NotesCliLoginError} When the login fails, or isn't finished in time
 */
export const login = async (options: LoginOptions): Promise<Session> => {
    const { resource, authorizationServer, scopes } = await discover(new URL(options.api));
    const client: oauth.Client = { client_id: options.clientId };
    const codeVerifier = oauth.generateRandomCodeVerifier();
    const state = oauth.generateRandomState();

    let redirectUri = '';
    const callback = await awaitRedirect(async uri => {
        redirectUri = uri;
        const url = new URL(authorizationServer.authorization_endpoint!);
        const query = new URLSearchParams({
            response_type: 'code',
            client_id: client.client_id,
            redirect_uri: redirectUri,
            code_challenge: await oauth.calculatePKCECodeChallenge(codeVerifier),
            code_challenge_method: 'S256',
            state,
            resource,
        });
        if (scopes.length > 0) {
            query.set('scope', scopes.join(' '));
        }
        url.search = query.toString();
        await options.openBrowser(url);
    }, options.timeoutSeconds);

    let parameters: URLSearchParams;
    try {
        // Checks the state, and that the response came from the server it went to (`iss`)
        parameters = oauth.validateAuthResponse(authorizationServer, client, callback, state);
    } catch (error) {
        const reason =
            error instanceof oauth.AuthorizationResponseError
                ? error.error
                : (error as Error).message;
        throw new NotesCliLoginError(`Login failed (${reason}). Run notes login again.`);
    }
    const response = await oauth.authorizationCodeGrantRequest(
        authorizationServer,
        client,
        oauth.None(),
        parameters,
        redirectUri,
        codeVerifier,
        {
            additionalParameters: { resource },
            ...requestOptions(new URL(authorizationServer.issuer)),
        }
    );
    const tokens = await oauth.processAuthorizationCodeResponse(
        authorizationServer,
        client,
        response
    );
    return toSession(
        {
            api: resource,
            issuer: authorizationServer.issuer,
            clientId: client.client_id,
            refreshToken: null,
        },
        tokens
    );
};

/**
 * A new access token, from the session's refresh token. The authorization server is the one the session was issued
 * by, found again from its issuer: never one the API names now, which could have changed since.
 *
 * @param session - With a refresh token
 * @returns The session, with the new tokens
 * @rejects {NotesCliLoginError} When there's no refresh token, or the authorization server refuses it
 * @rejects {NotesCliError} When the authorization server can't be asked (down, say)
 */
export const refresh = async (session: Session): Promise<Session> => {
    if (session.refreshToken === null) {
        throw new NotesCliLoginError(
            'The login has expired, and can not be refreshed. Run notes login again.'
        );
    }
    const issuer = new URL(session.issuer);
    const client: oauth.Client = { client_id: session.clientId };
    try {
        const authorizationServer = await discoverAuthorizationServer(issuer);
        const response = await oauth.refreshTokenGrantRequest(
            authorizationServer,
            client,
            oauth.None(),
            session.refreshToken,
            { additionalParameters: { resource: session.api }, ...requestOptions(issuer) }
        );
        const tokens = await oauth.processRefreshTokenResponse(
            authorizationServer,
            client,
            response
        );
        return toSession(session, tokens);
    } catch (error) {
        if (error instanceof oauth.ResponseBodyError) {
            throw new NotesCliLoginError(
                `The login has expired, and refreshing it was refused (${error.error}). Run notes login again.`
            );
        }
        throw new NotesCliError(
            `Failed to refresh the login at ${session.issuer} (${(error as Error).message}).`
        );
    }
};

/**
 * Revokes the session's refresh token (RFC 7009) at the authorization server that issued it, and with it the login
 * there: nothing can refresh it again. The access token stays good until it expires, as the API checks it without
 * asking the authorization server.
 *
 * @param session - To revoke
 * @returns `revoked`; `unrevocable` when there's no refresh token, so nothing the server can revoke; `unsupported`
 * when the server can't revoke tokens (it names no revocation endpoint)
 * @rejects {NotesCliError} When the authorization server can't be asked (down, say), or refuses
 */
export const revoke = async (
    session: Session
): Promise<'revoked' | 'unrevocable' | 'unsupported'> => {
    if (session.refreshToken === null) {
        return 'unrevocable';
    }
    const issuer = new URL(session.issuer);
    const client: oauth.Client = { client_id: session.clientId };
    try {
        const authorizationServer = await discoverAuthorizationServer(issuer);
        if (authorizationServer.revocation_endpoint === undefined) {
            return 'unsupported';
        }
        const response = await oauth.revocationRequest(
            authorizationServer,
            client,
            oauth.None(),
            session.refreshToken,
            {
                additionalParameters: { token_type_hint: 'refresh_token' },
                ...requestOptions(issuer),
            }
        );
        await oauth.processRevocationResponse(response);
        return 'revoked';
    } catch (error) {
        const reason =
            error instanceof oauth.ResponseBodyError ? error.error : (error as Error).message;
        throw new NotesCliError(
            `Logged out here, but ${session.issuer} did not revoke the login (${reason}): it stays good there until it expires.`
        );
    }
};

/**
 * RFC 8628's poll interval when the server names none, and how much longer each `slow_down` makes it (§3.5).
 */
const defaultDeviceIntervalSeconds = 5;
const slowDownSeconds = 5;

/**
 * Where the user goes to approve a device login, and the code they check there.
 */
export interface DeviceVerification {
    /**
     * `verification_uri_complete` (with the code in it) when the server gives one, else `verification_uri`.
     */
    readonly uri: string;
    readonly userCode: string;
}

export interface DeviceLoginOptions {
    readonly api: string;
    readonly clientId: string;
    /**
     * Tells the user where to go, and the code to check (or type) there.
     */
    readonly show: (verification: DeviceVerification) => void;
    /**
     * How long to wait for the user to approve, in seconds. Never longer than the code lasts.
     */
    readonly timeoutSeconds: number;
}

/**
 * Why the authorization server refused, as a login error.
 *
 * @param error - From oauth4webapi
 * @returns The error to exit with
 * @throws {Error} When it isn't the server refusing (an answer that isn't OAuth, say): as it is
 */
const loginFailed = (error: unknown): NotesCliLoginError => {
    if (error instanceof oauth.ResponseBodyError) {
        return new NotesCliLoginError(`Login failed (${error.error}). Run notes login again.`);
    }
    throw error;
};

/**
 * Logs in with the device authorization grant (RFC 8628), for a machine with no browser: the user approves on
 * another device, at a URL, checking the code shown here. Meanwhile the CLI polls for its tokens, at the interval
 * the server asks for. Asks for the same scopes and `resource` as `login`.
 *
 * @param options - The API, the client, and how to reach the user
 * @returns The session
 * @rejects {NotesCliError} When the API doesn't say how to log in, or its authorization server can't log in a device
 * @rejects {NotesCliLoginError} When the login is refused (or denied), or isn't approved in time
 */
export const loginWithDevice = async (options: DeviceLoginOptions): Promise<Session> => {
    const { resource, authorizationServer, scopes } = await discover(new URL(options.api));
    if (authorizationServer.device_authorization_endpoint === undefined) {
        throw new NotesCliError(
            `${authorizationServer.issuer} can't log in a device. Run notes login without --device.`
        );
    }
    const client: oauth.Client = { client_id: options.clientId };
    const issuer = new URL(authorizationServer.issuer);
    const parameters = new URLSearchParams({ resource });
    if (scopes.length > 0) {
        parameters.set('scope', scopes.join(' '));
    }
    let device: oauth.DeviceAuthorizationResponse;
    try {
        device = await oauth.processDeviceAuthorizationResponse(
            authorizationServer,
            client,
            await oauth.deviceAuthorizationRequest(
                authorizationServer,
                client,
                oauth.None(),
                parameters,
                requestOptions(issuer)
            )
        );
    } catch (error) {
        throw loginFailed(error);
    }
    options.show({
        uri: device.verification_uri_complete ?? device.verification_uri,
        userCode: device.user_code,
    });

    const timeoutSeconds = Math.min(options.timeoutSeconds, device.expires_in);
    const deadline = Date.now() + timeoutSeconds * millisecondsPerSecond;
    let intervalSeconds = device.interval ?? defaultDeviceIntervalSeconds;
    for (;;) {
        await sleep(intervalSeconds * millisecondsPerSecond);
        const response = await oauth.deviceCodeGrantRequest(
            authorizationServer,
            client,
            oauth.None(),
            device.device_code,
            { additionalParameters: { resource }, ...requestOptions(issuer) }
        );
        try {
            const tokens = await oauth.processDeviceCodeResponse(
                authorizationServer,
                client,
                response
            );
            return toSession(
                {
                    api: resource,
                    issuer: authorizationServer.issuer,
                    clientId: client.client_id,
                    refreshToken: null,
                },
                tokens
            );
        } catch (error) {
            const code = error instanceof oauth.ResponseBodyError ? error.error : undefined;
            if (code === 'slow_down') {
                intervalSeconds += slowDownSeconds;
            } else if (code !== 'authorization_pending') {
                throw loginFailed(error);
            }
        }
        if (Date.now() >= deadline) {
            throw new NotesCliLoginError(
                `Login timed out after ${timeoutSeconds}s. Run notes login again.`
            );
        }
    }
};
