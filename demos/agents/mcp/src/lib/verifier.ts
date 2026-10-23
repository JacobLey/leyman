import type { OAuthTokenVerifier } from '@modelcontextprotocol/server';
import type { JWTVerifyGetKey } from 'jose';
import { OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { discover, lazily } from './discovery.js';

export interface JwtVerifierOptions {
    /**
     * The authorization server agents get their tokens from.
     */
    readonly issuer: string;
    /**
     * This server's canonical URI: a token is accepted only when issued for it (`aud`, RFC 8707), never one meant for
     * another service, even from the same issuer.
     */
    readonly audience: string;
}

/**
 * Verifies agents' JWT access tokens (RFC 9068): signed by one of the issuer's keys, issued by it, for this server,
 * and not expired. The keys are discovered on first use.
 *
 * @param options - The issuer, and this server's audience
 * @returns A verifier for the SDK's bearer authentication, which checks scopes and expiry against what it returns
 */
export const jwtVerifier = (options: JwtVerifierOptions): OAuthTokenVerifier => {
    const keys = lazily(async (): Promise<JWTVerifyGetKey> => {
        const { jwks_uri: jwksUri } = await discover(options.issuer);
        return createRemoteJWKSet(new URL(jwksUri));
    });
    return {
        verifyAccessToken: async token => {
            const getKey = await keys();
            try {
                const { payload } = await jwtVerify(token, getKey, {
                    issuer: options.issuer,
                    audience: options.audience,
                    typ: 'at+jwt',
                    requiredClaims: ['exp', 'client_id'],
                });
                return {
                    token,
                    clientId: String(payload.client_id),
                    scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
                    expiresAt: payload.exp!,
                    resource: new URL(options.audience),
                    extra: { subject: payload.sub },
                };
            } catch (error) {
                if (error instanceof errors.JOSEError) {
                    throw new OAuthError(OAuthErrorCode.InvalidToken, error.message);
                }
                throw error;
            }
        },
    };
};
