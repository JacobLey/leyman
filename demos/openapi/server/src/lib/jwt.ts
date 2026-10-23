import type { JWTVerifyGetKey } from 'jose';
import type { Authenticator } from './types.js';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { NotesAuthorizationServerError } from './errors.js';

export interface JwtAuthenticatorOptions {
    /**
     * The authorization server that issues tokens for the API. Its keys are found through OpenID Connect discovery
     * (`/.well-known/openid-configuration`), which every common provider serves.
     */
    readonly issuer: string;
    /**
     * The API's own resource identifier: a token is accepted only when issued for it (`aud`), so a token for another
     * service, even from the same issuer, is not.
     */
    readonly audience: string;
}

/**
 * The issuer's signing keys, from its discovery document.
 *
 * @param issuer - The authorization server
 * @returns Its JSON Web Key Set, fetched (and refreshed) as tokens need it
 * @rejects {NotesAuthorizationServerError} When the document is missing, or names another issuer
 */
const discoverKeys = async (issuer: string): Promise<JWTVerifyGetKey> => {
    const response = await fetch(`${issuer.replace(/\/$/v, '')}/.well-known/openid-configuration`);
    if (!response.ok) {
        throw new NotesAuthorizationServerError(issuer, `discovery answered ${response.status}`);
    }
    const metadata = (await response.json()) as {
        readonly issuer?: unknown;
        readonly jwks_uri?: unknown;
    };
    // A document for another issuer would trust its keys for this one
    if (metadata.issuer !== issuer || typeof metadata.jwks_uri !== 'string') {
        throw new NotesAuthorizationServerError(
            issuer,
            'discovery named another issuer, or no keys'
        );
    }
    return createRemoteJWKSet(new URL(metadata.jwks_uri));
};

// eslint-disable-next-line jsdoc/require-rejects -- The authenticator it returns rejects, not this function
/**
 * Accepts JWT access tokens (RFC 9068) from an authorization server: signed by one of its keys, issued by it, for
 * this API, not expired, and with every scope the operation needs. The keys are discovered on the first request, and
 * again after a discovery fails. A failed discovery rejects (a `500`), since it says nothing about the token.
 *
 * @param options - The issuer, and this API's audience
 * @returns Checks a token against an operation's scopes
 */
export const jwtAuthenticator = (options: JwtAuthenticatorOptions): Authenticator => {
    let discovery: Promise<JWTVerifyGetKey> | null = null;
    const keys = async (): Promise<JWTVerifyGetKey> => {
        discovery ??= discoverKeys(options.issuer);
        try {
            return await discovery;
        } catch (error) {
            discovery = null;
            throw error;
        }
    };
    return async (token, scopes) => {
        const getKey = await keys();
        let scope: unknown;
        try {
            ({
                payload: { scope },
            } = await jwtVerify(token, getKey, {
                issuer: options.issuer,
                audience: options.audience,
                typ: 'at+jwt',
            }));
        } catch (error) {
            if (error instanceof errors.JOSEError) {
                return 'invalid';
            }
            throw error;
        }
        const granted = new Set(typeof scope === 'string' ? scope.split(' ') : []);
        return scopes.every(needed => granted.has(needed)) ? 'accepted' : 'insufficient_scope';
    };
};
