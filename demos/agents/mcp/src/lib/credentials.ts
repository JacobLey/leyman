import { discover, lazily, requestTimeoutMs } from './discovery.js';
import { NotesMcpAuthorizationServerError } from './errors.js';

export interface ClientCredentialsOptions {
    /**
     * The authorization server that issues tokens for the API.
     */
    readonly issuer: string;
    readonly clientId: string;
    readonly clientSecret: string;
    /**
     * The API's resource identifier (RFC 8707), so the token is for it and nothing else.
     */
    readonly resource: string;
    /**
     * What the server may do with the API.
     */
    readonly scopes: readonly string[];
}

/**
 * A token is used until this many seconds before it expires (or half its life, if shorter), so it doesn't expire on
 * its way to the API.
 */
const expiryMarginSeconds = 30;

/**
 * A client id or secret, encoded for HTTP Basic authentication as OAuth says (RFC 6749 §2.3.1): form-urlencoded
 * first, so a `:` (or anything else) in it can't be misread.
 *
 * @param value - The id or secret
 * @returns It, form-urlencoded
 */
const formEncode = (value: string): string => encodeURIComponent(value).replaceAll('%20', '+');

const millisecondsPerSecond = 1000;

interface CachedToken {
    readonly token: string;
    readonly expiresAt: number;
}

/**
 * The server's own token for the API, by the client credentials grant: the server acts as itself, never as the agent,
 * so an agent's token is never passed on. One token is shared until it nears expiry, and requests in the meantime
 * wait for the same one.
 *
 * @param options - The issuer, the server's credentials, and the API it calls
 * @returns A token, when asked for: e.g. the API client's `token`
 */
export const clientCredentials = (options: ClientCredentialsOptions): (() => Promise<string>) => {
    const tokenEndpoint = lazily(async () => {
        const { token_endpoint: endpoint } = await discover(options.issuer);
        return endpoint;
    });
    const credentials = [formEncode(options.clientId), formEncode(options.clientSecret)].join(':');
    const authorization = `Basic ${btoa(credentials)}`;

    const request = async (): Promise<CachedToken> => {
        const response = await fetch(await tokenEndpoint(), {
            method: 'POST',
            headers: { authorization },
            signal: AbortSignal.timeout(requestTimeoutMs),
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                resource: options.resource,
                scope: options.scopes.join(' '),
            }),
        });
        if (!response.ok) {
            throw new NotesMcpAuthorizationServerError(
                options.issuer,
                `refused the server's credentials (${response.status})`
            );
        }
        const body = (await response.json()) as {
            readonly access_token: string;
            readonly expires_in: number;
        };
        return {
            token: body.access_token,
            expiresAt:
                Date.now() +
                (body.expires_in - Math.min(expiryMarginSeconds, body.expires_in / 2)) *
                    millisecondsPerSecond,
        };
    };

    let latest: CachedToken | null = null;
    let refreshing: Promise<string> | null = null;
    const refresh = async (): Promise<string> => {
        try {
            const fresh = await request();
            latest = fresh;
            return fresh.token;
        } finally {
            refreshing = null;
        }
    };

    return async () => {
        if (latest !== null && latest.expiresAt > Date.now()) {
            return latest.token;
        }
        refreshing ??= refresh();
        return refreshing;
    };
};
