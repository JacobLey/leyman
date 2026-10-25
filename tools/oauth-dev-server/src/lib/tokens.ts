import type { FollowAuthorizationOptions } from './browser.js';
import { createHash, randomBytes } from 'node:crypto';
import { followAuthorization } from './browser.js';
import { DevAuthorizationFlowError } from './errors.js';

/**
 * Bytes of randomness in a PKCE code verifier: 43 characters once encoded, the least RFC 7636 allows.
 */
const verifierBytes = 32;

export interface UserTokensOptions extends FollowAuthorizationOptions {
    /**
     * The dev authorization server's issuer.
     */
    readonly issuer: string;
    /**
     * A public client registered with it (`clients`).
     */
    readonly clientId: string;
    /**
     * One of the client's redirect URIs. A loopback one may name any port.
     */
    readonly redirectUri: string;
    /**
     * What the token is for: a registered resource's URL.
     */
    readonly resource: string;
    /**
     * The scopes to ask for, space-separated. A login asks for at least one: `openid` alone gets a token for the
     * resource with none of its scopes.
     */
    readonly scope: string;
    /**
     * Who signs in (`login_hint`).
     *
     * @default the server's `accountId`
     */
    readonly user?: string | undefined;
}

/**
 * The token endpoint's response (RFC 6749 §5.1).
 */
export interface UserTokens {
    readonly access_token: string;
    readonly token_type: string;
    readonly expires_in: number;
    readonly scope?: string;
    /**
     * Unless the client opted out of refresh tokens.
     */
    readonly refresh_token?: string;
}

/**
 * Signs a user in through the whole authorization code flow with PKCE, as a native app would, with the dev login
 * playing the user: for a test that needs a user's token, without testing how a client gets one.
 *
 * @param options - The server, the client, and what to ask for
 * @returns What the token endpoint answered: the access token, and a refresh token unless the client opted out
 * @rejects {DevAuthorizationFlowError} When the authorization or the token request is refused
 */
export const userTokens = async (options: UserTokensOptions): Promise<UserTokens> => {
    const { issuer, clientId, redirectUri, resource, scope, user, cookies } = options;
    const verifier = randomBytes(verifierBytes).toString('base64url');
    const query = new URLSearchParams({
        resource,
        scope,
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        ...(user !== undefined && { login_hint: user }),
    });
    const authorization = new URL(`${issuer}/auth?${query.toString()}`);
    const callback = await followAuthorization(authorization, redirectUri, { cookies });
    const code = callback.searchParams.get('code');
    if (code === null) {
        throw new DevAuthorizationFlowError(
            authorization,
            `refused the authorization: ${String(callback.searchParams.get('error'))}`
        );
    }
    const tokenEndpoint = new URL(`${issuer}/token`);
    const response = await fetch(tokenEndpoint, {
        method: 'POST',
        body: new URLSearchParams({
            code,
            resource,
            grant_type: 'authorization_code',
            client_id: clientId,
            redirect_uri: redirectUri,
            code_verifier: verifier,
        }),
    });
    const body = (await response.json()) as UserTokens & { readonly error?: string };
    if (!response.ok) {
        throw new DevAuthorizationFlowError(
            tokenEndpoint,
            `refused the token request: ${String(body.error)}`
        );
    }
    return body;
};
