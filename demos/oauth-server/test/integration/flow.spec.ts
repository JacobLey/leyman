import type { AddressInfo } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import {
    DevAuthorizationFlowError,
    followAuthorization,
    listenDevAuthorizationServer,
} from '@leyman/demo-oauth-server';
import { expect } from '@leyman/expect';
import { beforeEach, suite, test } from 'mocha-chain';

const resource = 'http://127.0.0.1:1/mcp';
const otherResource = 'http://127.0.0.1:2/mcp';
const clientId = 'demo-client';
// A native app's loopback redirect matches on any port
const registeredRedirectUri = 'http://127.0.0.1/callback';
const redirectUri = 'http://127.0.0.1:3/callback';
const service = {
    clientId: 'demo-service',
    clientSecret: 'service-secret',
    scopes: ['notes:write'],
};

/**
 * A PKCE verifier and its S256 challenge.
 *
 * @returns Both
 */
const pkce = (): { readonly verifier: string; readonly challenge: string } => {
    const verifier = randomBytes(32).toString('base64url');
    return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

interface Metadata {
    readonly [key: string]: unknown;
    readonly issuer: string;
    readonly authorization_endpoint: string;
    readonly token_endpoint: string;
    readonly jwks_uri: string;
}

suite('Dev authorization server', () => {
    const withServer = beforeEach(async () => {
        const server = await listenDevAuthorizationServer({
            resources: [
                { url: resource, scopes: ['notes:read', 'notes:write'] },
                { url: otherResource, scopes: ['other'] },
            ],
            clients: [
                { clientId, redirectUris: [registeredRedirectUri] },
                {
                    clientId: 'no-refresh',
                    redirectUris: [registeredRedirectUri],
                    refreshTokens: false,
                },
            ],
            services: [service],
            accountId: 'dev-user',
        });
        const response = await fetch(`${server.issuer}/.well-known/oauth-authorization-server`);
        const metadata = (await response.json()) as Metadata;
        return { server, metadata };
    });
    withServer.afterEach(async ({ server }) => {
        await server.close();
    });

    /**
     * Where a client sends the user to authorize.
     *
     * @param metadata - The authorization server's metadata
     * @param params - Query parameters, over the defaults
     * @returns The endpoint, with every parameter in its query
     */
    const authorizationUrl = (
        metadata: Metadata,
        params: Readonly<Record<string, string | undefined>>
    ): URL => {
        const url = new URL(metadata.authorization_endpoint);
        const all: Readonly<Record<string, string | undefined>> = {
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            state: 'some-state',
            resource,
            scope: 'notes:read',
            ...params,
        };
        for (const [name, value] of Object.entries(all)) {
            if (value !== undefined) {
                url.searchParams.set(name, value);
            }
        }
        return url;
    };

    /**
     * Swaps a code for tokens.
     *
     * @param metadata - The authorization server's metadata
     * @param params - Form parameters, over the defaults
     * @returns The token endpoint's status and JSON body
     */
    const exchange = async (
        metadata: Metadata,
        params: Readonly<Record<string, string | undefined>>
    ): Promise<{ readonly status: number; readonly body: Readonly<Record<string, unknown>> }> => {
        const all: Readonly<Record<string, string | undefined>> = {
            grant_type: 'authorization_code',
            client_id: clientId,
            redirect_uri: redirectUri,
            resource,
            ...params,
        };
        const response = await fetch(metadata.token_endpoint, {
            method: 'POST',
            body: new URLSearchParams(
                Object.entries(all).filter(
                    (entry): entry is [string, string] => entry[1] !== undefined
                )
            ),
        });
        return {
            status: response.status,
            body: (await response.json()) as Record<string, unknown>,
        };
    };

    suite('Metadata', () => {
        withServer.test('Is served at the issuer', ({ server, metadata }) => {
            expect(metadata.issuer).to.equal(server.issuer);
        });

        withServer.test('Requires PKCE with S256', ({ metadata }) => {
            expect(metadata.code_challenge_methods_supported).to.deep.equal(['S256']);
        });

        withServer.test('Puts iss in authorization responses', ({ metadata }) => {
            expect(metadata.authorization_response_iss_parameter_supported).to.equal(true);
        });

        withServer.test('Lists every resource scope', ({ metadata }) => {
            expect(metadata.scopes_supported).to.include.members([
                'notes:read',
                'notes:write',
                'other',
            ]);
        });

        withServer.test('Is also served for OpenID Connect discovery', async ({ server }) => {
            const response = await fetch(`${server.issuer}/.well-known/openid-configuration`);
            const body = (await response.json()) as Metadata;

            expect(body.issuer).to.equal(server.issuer);
        });
    });

    suite('Authorization code flow', () => {
        withServer.test(
            'Redirects back with a code, the state and the issuer',
            async ({ server, metadata }) => {
                const { challenge } = pkce();

                const callback = await followAuthorization(
                    authorizationUrl(metadata, {
                        code_challenge: challenge,
                        code_challenge_method: 'S256',
                    }),
                    redirectUri
                );

                expect(callback.searchParams.get('code')).to.be.a('string');
                expect(callback.searchParams.get('state')).to.equal('some-state');
                expect(callback.searchParams.get('iss')).to.equal(server.issuer);
            }
        );

        withServer.test(
            'Issues a JWT access token for the resource, with the scopes asked for',
            async ({ server, metadata }) => {
                const { verifier, challenge } = pkce();
                const callback = await followAuthorization(
                    authorizationUrl(metadata, {
                        code_challenge: challenge,
                        code_challenge_method: 'S256',
                    }),
                    redirectUri
                );

                const { status, body } = await exchange(metadata, {
                    code: callback.searchParams.get('code')!,
                    code_verifier: verifier,
                });

                expect(status).to.equal(200);
                expect(body).to.include({ token_type: 'Bearer', scope: 'notes:read' });
                const token = body.access_token as string;
                expect(decodeProtectedHeader(token).typ).to.equal('at+jwt');
                const { payload } = await jwtVerify(
                    token,
                    createRemoteJWKSet(new URL(metadata.jwks_uri)),
                    { issuer: server.issuer, audience: resource }
                );
                expect(payload).to.include({
                    sub: 'dev-user',
                    client_id: clientId,
                    scope: 'notes:read',
                });
            }
        );

        withServer.test(
            'Issues a refresh token that gets a new access token',
            async ({ metadata }) => {
                const { verifier, challenge } = pkce();
                const callback = await followAuthorization(
                    authorizationUrl(metadata, {
                        code_challenge: challenge,
                        code_challenge_method: 'S256',
                    }),
                    redirectUri
                );
                const { body: tokens } = await exchange(metadata, {
                    code: callback.searchParams.get('code')!,
                    code_verifier: verifier,
                });

                const { status, body } = await exchange(metadata, {
                    grant_type: 'refresh_token',
                    refresh_token: tokens.refresh_token as string,
                    redirect_uri: undefined,
                });

                expect(status).to.equal(200);
                expect(body).to.include({ scope: 'notes:read' });
                expect(body.access_token).to.be.a('string').and.not.equal(tokens.access_token);
            }
        );

        withServer.test(
            'Issues no refresh token to a client without them',
            async ({ metadata }) => {
                const { verifier, challenge } = pkce();
                const callback = await followAuthorization(
                    authorizationUrl(metadata, {
                        client_id: 'no-refresh',
                        code_challenge: challenge,
                        code_challenge_method: 'S256',
                    }),
                    redirectUri
                );

                const { body } = await exchange(metadata, {
                    client_id: 'no-refresh',
                    code: callback.searchParams.get('code')!,
                    code_verifier: verifier,
                });

                expect(body).to.have.property('access_token');
                expect(body).to.not.have.property('refresh_token');
            }
        );

        withServer.test('Drops scopes the resource does not have', async ({ metadata }) => {
            const { verifier, challenge } = pkce();
            const callback = await followAuthorization(
                authorizationUrl(metadata, {
                    code_challenge: challenge,
                    code_challenge_method: 'S256',
                    scope: 'notes:read other',
                }),
                redirectUri
            );

            const { body } = await exchange(metadata, {
                code: callback.searchParams.get('code')!,
                code_verifier: verifier,
            });

            expect(body.scope).to.equal('notes:read');
        });

        withServer.test(
            'Signs in for OpenID Connect, with no resource',
            async ({ server, metadata }) => {
                const { verifier, challenge } = pkce();
                const callback = await followAuthorization(
                    authorizationUrl(metadata, {
                        code_challenge: challenge,
                        code_challenge_method: 'S256',
                        resource: undefined,
                        scope: 'openid',
                    }),
                    redirectUri
                );

                const { body } = await exchange(metadata, {
                    code: callback.searchParams.get('code')!,
                    code_verifier: verifier,
                    resource: undefined,
                });

                const { payload } = await jwtVerify(
                    body.id_token as string,
                    createRemoteJWKSet(new URL(metadata.jwks_uri)),
                    { issuer: server.issuer, audience: clientId }
                );
                expect(payload.sub).to.equal('dev-user');
            }
        );

        withServer.test('Rejects a code without its PKCE verifier', async ({ metadata }) => {
            const { challenge } = pkce();
            const callback = await followAuthorization(
                authorizationUrl(metadata, {
                    code_challenge: challenge,
                    code_challenge_method: 'S256',
                }),
                redirectUri
            );

            const { status, body } = await exchange(metadata, {
                code: callback.searchParams.get('code')!,
                code_verifier: pkce().verifier,
            });

            expect(status).to.equal(400);
            expect(body.error).to.equal('invalid_grant');
        });

        withServer.test('Refuses an authorization without PKCE', async ({ metadata }) => {
            const callback = await followAuthorization(authorizationUrl(metadata, {}), redirectUri);

            expect(callback.searchParams.get('error')).to.equal('invalid_request');
            expect(callback.searchParams.has('code')).to.equal(false);
        });

        withServer.test('Refuses an unknown resource', async ({ metadata }) => {
            const { challenge } = pkce();

            const callback = await followAuthorization(
                authorizationUrl(metadata, {
                    code_challenge: challenge,
                    code_challenge_method: 'S256',
                    resource: 'http://127.0.0.1:4/unknown',
                }),
                redirectUri
            );

            expect(callback.searchParams.get('error')).to.equal('invalid_target');
        });
    });

    suite('Client credentials', () => {
        /**
         * Asks for a token as the service.
         *
         * @param metadata - The authorization server's metadata
         * @param secret - The service's secret, or another
         * @param scope - What it asks for
         * @returns The token endpoint's status and JSON body
         */
        const serviceToken = async (
            metadata: Metadata,
            secret: string,
            scope = 'notes:write'
        ): Promise<{
            readonly status: number;
            readonly body: Readonly<Record<string, unknown>>;
        }> => {
            const response = await fetch(metadata.token_endpoint, {
                method: 'POST',
                headers: {
                    authorization: `Basic ${btoa([service.clientId, secret].join(':'))}`,
                },
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    resource,
                    scope,
                }),
            });
            return {
                status: response.status,
                body: (await response.json()) as Record<string, unknown>,
            };
        };

        withServer.test(
            'Issues a token for the resource, as the service, with no refresh token',
            async ({ server, metadata }) => {
                const { status, body } = await serviceToken(metadata, service.clientSecret);

                expect(status).to.equal(200);
                const { payload } = await jwtVerify(
                    body.access_token as string,
                    createRemoteJWKSet(new URL(metadata.jwks_uri)),
                    { issuer: server.issuer, audience: resource }
                );
                // RFC 9068: with no user, the subject is the client itself
                expect(payload).to.include({
                    sub: service.clientId,
                    client_id: service.clientId,
                    scope: 'notes:write',
                });
                expect(body).to.not.have.property('refresh_token');
            }
        );

        withServer.test('Refuses a scope the service may not have', async ({ metadata }) => {
            const { status, body } = await serviceToken(
                metadata,
                service.clientSecret,
                'notes:read notes:write'
            );

            expect(status).to.equal(400);
            expect(body.error).to.equal('invalid_scope');
        });

        withServer.test('Refuses a wrong secret', async ({ metadata }) => {
            const { status, body } = await serviceToken(metadata, 'wrong');

            expect(status).to.equal(401);
            expect(body.error).to.equal('invalid_client');
        });
    });

    suite('Interactions', () => {
        withServer.test('Refuses one without its cookie', async ({ server }) => {
            const response = await fetch(`${server.issuer}/interaction/unknown`, {
                redirect: 'manual',
            });

            expect(response.status).to.equal(400);
        });
    });

    suite('close', () => {
        test('Rejects once already closed', async () => {
            const server = await listenDevAuthorizationServer({
                resources: [],
                clients: [],
                services: [],
                accountId: 'dev-user',
            });
            await server.close();

            await expect(server.close()).to.be.rejectedWith('Server is not running');
        });
    });

    suite('followAuthorization', () => {
        withServer.test('Rejects an answer that is not a redirect', async ({ server }) => {
            await expect(
                followAuthorization(`${server.issuer}/interaction/unknown`, redirectUri)
            ).to.be.rejectedWith(
                DevAuthorizationFlowError,
                '/interaction/unknown: answered 400, not a redirect'
            );
        });

        test('Rejects endless redirects', async () => {
            const loop = createServer((_request, response) => {
                response.writeHead(302, { location: '/again' }).end();
            });
            loop.listen(0, '127.0.0.1');
            await once(loop, 'listening');
            const { port } = loop.address() as AddressInfo;
            try {
                await expect(
                    followAuthorization(`http://127.0.0.1:${port}/`, redirectUri)
                ).to.be.rejectedWith(DevAuthorizationFlowError, '/again: more than 10 redirects');
            } finally {
                loop.close();
                loop.closeAllConnections();
            }
        });
    });
});
