import type { Credentials } from '@leyman/demo-fetch-middleware';
import { authorizationServerFetch, discover, lazily } from './discovery.js';
import { NotesMcpAuthorizationServerError } from './errors.js';

const textEncoder = new TextEncoder();

export interface TokenExchangeOptions {
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

const accessTokenType = 'urn:ietf:params:oauth:token-type:access_token';

interface Exchanged {
    readonly token: string;
    /**
     * When to stop using the token, or `null` when the authorization server didn't say when it expires.
     */
    readonly expiresAt: number | null;
}

/**
 * An exchanged token kept for later requests: only one that says when it expires.
 */
interface Kept extends Exchanged {
    readonly expiresAt: number;
}

/**
 * A token exchange's response (RFC 8693 §2.2.1): `access_token` is required, and `expires_in` only recommended.
 * Without it, the token's lifetime is unknown, so it's used only for the requests that waited for this exchange, and
 * never kept: a guessed lifetime could keep sending it after it expired.
 *
 * @param issuer - Who answered, for errors
 * @param body - The response's JSON
 * @returns The token, and when to stop using it
 * @throws {NotesMcpAuthorizationServerError} When `access_token` isn't a non-empty string, or `expires_in` is there
 * but isn't a positive number
 */
const parseExchanged = (issuer: string, body: unknown): Exchanged => {
    const {
        access_token: token,
        expires_in: expiresIn,
    }: Partial<Record<'access_token' | 'expires_in', unknown>> =
        typeof body === 'object' && body !== null ? body : {};
    if (typeof token !== 'string' || token === '') {
        throw new NotesMcpAuthorizationServerError(
            issuer,
            'exchanged the token for no access_token'
        );
    }
    if (expiresIn === undefined) {
        return { token, expiresAt: null };
    }
    if (typeof expiresIn !== 'number' || expiresIn <= 0) {
        throw new NotesMcpAuthorizationServerError(
            issuer,
            'exchanged the token with an invalid expires_in'
        );
    }
    return {
        token,
        expiresAt:
            Date.now() +
            (expiresIn - Math.min(expiryMarginSeconds, expiresIn / 2)) * millisecondsPerSecond,
    };
};

/**
 * Tokens for the API, as the agent's user, by token exchange (RFC 8693): the agent's token (issued for this server,
 * and never sent anywhere else) is traded at the authorization server for one for the API, with the same user, at
 * most the same scopes, and this server named as the one acting for them. The server authenticates as itself to do
 * so, so a token an agent sent can't be exchanged by anyone else.
 *
 * Each agent token's exchange is kept until it nears expiry, and requests in the meantime wait for the same one;
 * expired ones are dropped as new ones come in. When the API refuses one before then (its keys rotated, say),
 * `renew` exchanges the agent's token again, once for every request refused the same token: requests that come
 * later get the renewed one. An exchange whose response doesn't say when its token expires (no `expires_in`) is used
 * only by the requests that waited for it, and isn't kept: the next request exchanges again.
 *
 * @param options - The issuer, the server's credentials, and the API it calls
 * @returns The credentials for an agent's token, for `bearer`: `token` and `renew` reject with a
 * `NotesMcpAuthorizationServerError` when the authorization server can't be found or refuses the exchange
 */
export const tokenExchange = (
    options: TokenExchangeOptions
): ((agentToken: string) => Credentials) => {
    const tokenEndpoint = lazily(async () => discover(options.issuer, 'token_endpoint'));
    const credentials = [formEncode(options.clientId), formEncode(options.clientSecret)].join(':');
    const authorization = `Basic ${textEncoder.encode(credentials).toBase64()}`;

    const request = async (agentToken: string): Promise<Exchanged> => {
        const response = await authorizationServerFetch(await tokenEndpoint(), {
            method: 'POST',
            headers: { authorization },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
                subject_token: agentToken,
                subject_token_type: accessTokenType,
                requested_token_type: accessTokenType,
                resource: options.resource,
            }),
        });
        if (!response.ok) {
            throw new NotesMcpAuthorizationServerError(
                options.issuer,
                `refused to exchange the agent's token (${response.status})`
            );
        }
        return parseExchanged(options.issuer, await response.json());
    };

    const exchanged = new Map<string, Kept>();
    const pending = new Map<string, Promise<string>>();
    const exchange = async (agentToken: string): Promise<string> => {
        try {
            const fresh = await request(agentToken);
            const now = Date.now();
            for (const [key, { expiresAt }] of exchanged) {
                if (expiresAt <= now) {
                    exchanged.delete(key);
                }
            }
            if (fresh.expiresAt !== null) {
                exchanged.set(agentToken, { token: fresh.token, expiresAt: fresh.expiresAt });
            }
            return fresh.token;
        } finally {
            pending.delete(agentToken);
        }
    };

    const exchangeOnce = async (agentToken: string): Promise<string> => {
        let inFlight = pending.get(agentToken);
        if (inFlight === undefined) {
            inFlight = exchange(agentToken);
            pending.set(agentToken, inFlight);
        }
        return inFlight;
    };

    return agentToken => ({
        token: async () => {
            const known = exchanged.get(agentToken);
            return known !== undefined && known.expiresAt > Date.now()
                ? known.token
                : exchangeOnce(agentToken);
        },
        renew: async refused => {
            const known = exchanged.get(agentToken);
            // Renewed already, by a request refused before this one
            if (known !== undefined && known.token !== refused) {
                return known.token;
            }
            exchanged.delete(agentToken);
            return exchangeOnce(agentToken);
        },
    });
};
