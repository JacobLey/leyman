import { discover, lazily, requestTimeoutMs } from './discovery.js';
import { NotesMcpAuthorizationServerError } from './errors.js';

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
    readonly expiresAt: number;
}

/**
 * Tokens for the API, as the agent's user, by token exchange (RFC 8693): the agent's token (issued for this server,
 * and never sent anywhere else) is traded at the authorization server for one for the API, with the same user, at
 * most the same scopes, and this server named as the one acting for them. The server authenticates as itself to do
 * so, so a token an agent sent can't be exchanged by anyone else.
 *
 * Each agent token's exchange is kept until it nears expiry, and requests in the meantime wait for the same one;
 * expired ones are dropped as new ones come in.
 *
 * @param options - The issuer, the server's credentials, and the API it calls
 * @returns A token for the API, for an agent's token
 */
export const tokenExchange = (
    options: TokenExchangeOptions
): ((agentToken: string) => Promise<string>) => {
    const tokenEndpoint = lazily(async () => {
        const { token_endpoint: endpoint } = await discover(options.issuer);
        return endpoint;
    });
    const credentials = [formEncode(options.clientId), formEncode(options.clientSecret)].join(':');
    const authorization = `Basic ${btoa(credentials)}`;

    const request = async (agentToken: string): Promise<Exchanged> => {
        const response = await fetch(await tokenEndpoint(), {
            method: 'POST',
            headers: { authorization },
            signal: AbortSignal.timeout(requestTimeoutMs),
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

    const exchanged = new Map<string, Exchanged>();
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
            exchanged.set(agentToken, fresh);
            return fresh.token;
        } finally {
            pending.delete(agentToken);
        }
    };

    return async agentToken => {
        const known = exchanged.get(agentToken);
        if (known !== undefined && known.expiresAt > Date.now()) {
            return known.token;
        }
        let inFlight = pending.get(agentToken);
        if (inFlight === undefined) {
            inFlight = exchange(agentToken);
            pending.set(agentToken, inFlight);
        }
        return inFlight;
    };
};
