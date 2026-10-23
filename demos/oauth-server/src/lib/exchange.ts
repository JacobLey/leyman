import type { TokenEndpointGrantContext } from 'oidc-provider';
import type { ResourceServer, ServiceClient } from './provider.js';
import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { errors } from 'oidc-provider';

/**
 * RFC 8693's grant type.
 */
export const tokenExchangeGrantType = 'urn:ietf:params:oauth:grant-type:token-exchange';

/**
 * The parameters a token exchange request may have (RFC 8693 §2.1), beyond those of every grant.
 */
export const tokenExchangeParameters = [
    'subject_token',
    'subject_token_type',
    'requested_token_type',
    'resource',
    'scope',
] as const;

interface TokenExchangeParameters {
    readonly subject_token?: string | undefined;
    readonly subject_token_type?: string | undefined;
    readonly requested_token_type?: string | undefined;
}

const accessTokenType = 'urn:ietf:params:oauth:token-type:access_token';

const millisecondsPerSecond = 1000;

export interface TokenExchangeOptions {
    readonly issuer: string;
    /**
     * The key every access token is signed with, its public half, and its id.
     */
    readonly keys: {
        readonly privateKey: CryptoKey;
        readonly publicKey: CryptoKey;
        readonly kid: string;
    };
    readonly resources: ReadonlyMap<string, ResourceServer>;
    readonly services: ReadonlyMap<string, ServiceClient>;
    readonly accessTokenTtl: number;
}

// eslint-disable-next-line jsdoc/require-rejects -- The handler it returns rejects, as oidc-provider's errors
/**
 * The token exchange grant (RFC 8693), for a service that is itself a resource (an MCP server, say): it trades a
 * user's access token, issued for it, for one for a resource it calls, still as that user. oidc-provider has no such
 * grant, so this registers one, and signs its tokens as oidc-provider signs every access token (RFC 9068, with the
 * same key), so a resource server can't tell them apart.
 *
 * The new token is the user's (`sub`), for the resource asked for (`aud`), with `act` naming the service acting for
 * them (RFC 8693 §4.1). Its scopes are at most what the user granted, the resource understands, and the service may
 * have; and it never outlives the token it was exchanged for.
 *
 * @param options - The issuer, its keys, the resources and the services
 * @returns oidc-provider's handler for the grant
 */
export const tokenExchange =
    (options: TokenExchangeOptions) =>
    async (ctx: TokenEndpointGrantContext<TokenExchangeParameters>): Promise<void> => {
        const { client, params } = ctx.oidc;
        // Only services with `tokenExchange` are allowed the grant, so only they get here
        const service = options.services.get(client.clientId)!;
        const { subjectAudience } = service.tokenExchange!;
        if (params.subject_token_type !== accessTokenType) {
            throw new errors.InvalidRequest(`subject_token_type must be ${accessTokenType}`);
        }
        if (
            params.requested_token_type !== undefined &&
            params.requested_token_type !== accessTokenType
        ) {
            throw new errors.InvalidRequest(`requested_token_type must be ${accessTokenType}`);
        }
        // The provider has refused one it doesn't know (`getResourceServerInfo`), but not none
        const resource = options.resources.get(params.resource as string);
        if (!resource) {
            throw new errors.InvalidTarget(
                'resource must be a resource this server issues tokens for'
            );
        }

        let subject: { readonly sub?: string; readonly scope?: unknown; readonly exp?: number };
        try {
            ({ payload: subject } = await jwtVerify(params.subject_token!, options.keys.publicKey, {
                issuer: options.issuer,
                // Only a token issued for the service itself: never one it was handed for somewhere else
                audience: subjectAudience,
                typ: 'at+jwt',
                // Every access token this server issues has a scope
                requiredClaims: ['sub', 'exp', 'scope'],
            }));
        } catch {
            // Checked against the server's own key: nothing to reach, so any failure is the token's
            throw new errors.InvalidGrant(
                `subject_token is not a valid access token for ${subjectAudience}`
            );
        }

        const allowed = new Set(service.scopes);
        const understood = new Set(resource.scopes);
        const granted = (subject.scope as string)
            .split(' ')
            .filter(scope => allowed.has(scope) && understood.has(scope));
        const requested = params.scope === undefined ? granted : params.scope.split(' ');
        if (requested.some(scope => !granted.includes(scope))) {
            throw new errors.InvalidScope(
                'scope must be among those the subject_token grants',
                requested.join(' ')
            );
        }

        const now = Math.floor(Date.now() / millisecondsPerSecond);
        const expiresAt = Math.min(now + options.accessTokenTtl, subject.exp!);
        const scope = requested.join(' ');
        const claims = new SignJWT({
            scope,
            client_id: service.clientId,
            act: { sub: service.clientId },
        });
        const accessToken = await claims
            .setProtectedHeader({ alg: 'ES256', typ: 'at+jwt', kid: options.keys.kid })
            .setIssuer(options.issuer)
            .setSubject(subject.sub!)
            .setAudience(resource.url)
            .setIssuedAt(now)
            .setExpirationTime(expiresAt)
            .setJti(randomUUID())
            .sign(options.keys.privateKey);

        // eslint-disable-next-line require-atomic-updates -- The request's own context, which nothing else changes
        ctx.body = {
            access_token: accessToken,
            issued_token_type: accessTokenType,
            token_type: 'Bearer',
            expires_in: expiresAt - now,
            scope,
        };
    };
