import type { AddressInfo } from 'node:net';
import type { Session } from './session.js';
import { once } from 'node:events';
import { createServer } from 'node:http';
import * as oauth from 'oauth4webapi';
import { NotesCliError } from './errors.js';

/**
 * Plain HTTP is allowed only to this machine (a local API or authorization server); anywhere else must be HTTPS.
 *
 * @param url - Where a request goes
 * @returns `oauth4webapi`'s option allowing HTTP, when it's local
 */
/* eslint-disable @typescript-eslint/no-deprecated, sonarjs/deprecation -- Deprecated to stand out: only for here */
const local = (url: URL): { [oauth.allowInsecureRequests]: boolean } => ({
    [oauth.allowInsecureRequests]: ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname),
});
/* eslint-enable @typescript-eslint/no-deprecated, sonarjs/deprecation */

/**
 * Seconds before an access token expires that it's refreshed, so it doesn't expire on its way to the API.
 */
const expiryMarginSeconds = 30;

const millisecondsPerSecond = 1000;

const statusOk = 200;
const statusNotFound = 404;

interface Discovered {
    /**
     * The API's identifier, as it says it (RFC 9728), for the `resource` of its tokens (RFC 8707).
     */
    readonly resource: string;
    readonly authorizationServer: oauth.AuthorizationServer;
    readonly scopes: readonly string[];
}

/**
 * Finds who issues the API's tokens, from the API alone: its Protected Resource Metadata (RFC 9728) names the
 * authorization server and the scopes, and the server's metadata (RFC 8414) its endpoints. Both are checked to be
 * about what was asked for.
 *
 * @param api - The API's URL
 * @returns Its identifier, its authorization server, and the scopes it understands
 * @rejects {NotesCliError} When the API or its authorization server doesn't say
 */
const discover = async (api: URL): Promise<Discovered> => {
    try {
        const metadata = await oauth.processResourceDiscoveryResponse(
            api,
            await oauth.resourceDiscoveryRequest(api, local(api))
        );
        // Validated by oauth4webapi: a non-empty list of URLs
        const issuer = new URL(metadata.authorization_servers![0]!);
        const authorizationServer = await oauth.processDiscoveryResponse(
            issuer,
            await oauth.discoveryRequest(issuer, { algorithm: 'oauth2', ...local(issuer) })
        );
        return {
            authorizationServer,
            resource: metadata.resource,
            // The notes API names its scopes, and the CLI is only for it
            scopes: metadata.scopes_supported!,
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
    // Every token response from the authorization servers the CLI is for says when it expires
    expiresAt: Date.now() + (tokens.expires_in! - expiryMarginSeconds) * millisecondsPerSecond,
});

/**
 * Waits for the browser to come back to a loopback redirect URI (RFC 8252), on a free port of this machine.
 *
 * @param use - Called with the redirect URI, once listening: starts the authorization
 * @returns Where the browser came back to, with the authorization's result in its query
 */
const awaitRedirect = async (use: (redirectUri: string) => Promise<void>): Promise<URL> => {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
    try {
        const callback = new Promise<URL>(resolve => {
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
}

/**
 * Logs in with the authorization code flow, as a native app: PKCE, a loopback redirect, `state`, the `iss` the
 * response must come from (RFC 9207), and a token for the API alone (`resource`, RFC 8707). Asks for every scope the
 * API names, as the CLI can do whatever its user may.
 *
 * @param options - The API, the client, and how to reach the user
 * @returns The session
 * @rejects {NotesCliError} When the API doesn't say how to log in, or the login fails
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
            scope: scopes.join(' '),
            code_challenge: await oauth.calculatePKCECodeChallenge(codeVerifier),
            code_challenge_method: 'S256',
            state,
            resource,
        });
        url.search = query.toString();
        await options.openBrowser(url);
    });

    let parameters: URLSearchParams;
    try {
        // Checks the state, and that the response came from the server it went to (`iss`)
        parameters = oauth.validateAuthResponse(authorizationServer, client, callback, state);
    } catch (error) {
        const reason =
            error instanceof oauth.AuthorizationResponseError
                ? error.error
                : (error as Error).message;
        throw new NotesCliError(`Login failed (${reason}). Run notes login again.`);
    }
    const issuer = new URL(authorizationServer.issuer);
    const response = await oauth.authorizationCodeGrantRequest(
        authorizationServer,
        client,
        oauth.None(),
        parameters,
        redirectUri,
        codeVerifier,
        { additionalParameters: { resource }, ...local(issuer) }
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
 * A new access token, from the session's refresh token.
 *
 * @param session - With a refresh token
 * @returns The session, with the new tokens
 * @rejects {NotesCliError} When there's no refresh token, or the refresh fails
 */
export const refresh = async (session: Session): Promise<Session> => {
    if (session.refreshToken === null) {
        throw new NotesCliError(
            'The login has expired, and can not be refreshed. Run notes login again.'
        );
    }
    const { authorizationServer } = await discover(new URL(session.api));
    const client: oauth.Client = { client_id: session.clientId };
    try {
        const issuer = new URL(authorizationServer.issuer);
        const response = await oauth.refreshTokenGrantRequest(
            authorizationServer,
            client,
            oauth.None(),
            session.refreshToken,
            { additionalParameters: { resource: session.api }, ...local(issuer) }
        );
        const tokens = await oauth.processRefreshTokenResponse(
            authorizationServer,
            client,
            response
        );
        return toSession(session, tokens);
    } catch (error) {
        throw new NotesCliError(
            `The login has expired, and refreshing it failed (${(error as Error).message}). Run notes login again.`
        );
    }
};
