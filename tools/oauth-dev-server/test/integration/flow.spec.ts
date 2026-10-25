import type { AddressInfo } from 'node:net';
import type { UserTokensOptions } from 'oauth-dev-server';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose';
import { expect } from '@leyman/expect';
import { beforeEach, suite, test } from 'mocha-chain';
import {
    approveDevice,
    createDevAuthorizationServer,
    DevAuthorizationFlowError,
    DevAuthorizationServerNotLocalError,
    followAuthorization,
    listenDevAuthorizationServer,
    userTokens,
} from 'oauth-dev-server';

const resource = 'http://127.0.0.1:1/mcp';
const otherResource = 'http://127.0.0.1:2/mcp';
const clientId = 'test-client';
// A native app's loopback redirect matches on any port
const registeredRedirectUri = 'http://127.0.0.1/callback';
const redirectUri = 'http://127.0.0.1:3/callback';
const service = {
    clientId: 'test-service',
    clientSecret: 'service-secret',
    scopes: ['notes:write'],
};
// A resource users have tokens for (`resource`), calling another as them
const apiResource = 'http://127.0.0.1:4/api';
const exchanger = {
    clientId: 'test-exchanger',
    clientSecret: 'exchanger-secret',
    scopes: ['notes:read', 'notes:write'],
    tokenExchange: { subjectAudience: resource },
};
const deviceClientId = 'test-device';
const deviceCodeGrant = 'urn:ietf:params:oauth:grant-type:device_code';
const tokenExchangeGrant = 'urn:ietf:params:oauth:grant-type:token-exchange';
const accessTokenType = 'urn:ietf:params:oauth:token-type:access_token';

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
                { url: apiResource, scopes: ['notes:read', 'notes:write', 'admin'] },
            ],
            clients: [
                { clientId, redirectUris: [registeredRedirectUri] },
                {
                    clientId: 'no-refresh',
                    redirectUris: [registeredRedirectUri],
                    refreshTokens: false,
                },
                {
                    clientId: deviceClientId,
                    redirectUris: [registeredRedirectUri],
                    deviceAuthorization: true,
                },
            ],
            services: [service, exchanger],
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

    /**
     * A user's access token for `resource`, signed in by `userTokens`.
     *
     * @param metadata - The authorization server's metadata
     * @param options - Over the defaults
     * @returns The access token
     */
    const userToken = async (
        metadata: Metadata,
        options: Partial<UserTokensOptions> = {}
    ): Promise<string> => {
        const tokens = await userTokens({
            clientId,
            redirectUri,
            resource,
            issuer: metadata.issuer,
            scope: 'notes:read',
            ...options,
        });
        return tokens.access_token;
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

        withServer.test(
            'Extends the grant when the same browser authorizes again, to step up',
            async ({ metadata }) => {
                const cookies = new Map<string, string>();
                const authorize = async (scope: string): Promise<string | undefined> => {
                    const { verifier, challenge } = pkce();
                    const callback = await followAuthorization(
                        authorizationUrl(metadata, {
                            code_challenge: challenge,
                            code_challenge_method: 'S256',
                            scope,
                        }),
                        redirectUri,
                        { cookies }
                    );
                    const { body } = await exchange(metadata, {
                        code: callback.searchParams.get('code')!,
                        code_verifier: verifier,
                    });
                    return body.scope as string | undefined;
                };

                expect(await authorize('notes:read')).to.equal('notes:read');
                expect(await authorize('notes:read notes:write')).to.equal(
                    'notes:read notes:write'
                );
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

    suite('Revocation', () => {
        /**
         * Revokes a token, as the public client that holds it.
         *
         * @param metadata - The authorization server's metadata
         * @param token - To revoke
         * @returns The revocation endpoint's status and body
         */
        const revoke = async (
            metadata: Metadata,
            token: string
        ): Promise<{ readonly status: number; readonly body: string }> => {
            const response = await fetch(metadata.revocation_endpoint as string, {
                method: 'POST',
                body: new URLSearchParams({ token, client_id: clientId }),
            });
            return { status: response.status, body: await response.text() };
        };

        withServer.test('Revokes a refresh token', async ({ metadata }) => {
            const tokens = await userTokens({
                clientId,
                redirectUri,
                resource,
                issuer: metadata.issuer,
                scope: 'notes:read',
            });

            const revoked = await revoke(metadata, tokens.refresh_token!);
            const { status, body } = await exchange(metadata, {
                grant_type: 'refresh_token',
                refresh_token: tokens.refresh_token!,
                redirect_uri: undefined,
            });

            expect(revoked.status).to.equal(200);
            expect(status).to.equal(400);
            expect(body).to.include({ error: 'invalid_grant' });
        });

        withServer.test('Answers 200 for a token it does not know', async ({ metadata }) => {
            // RFC 7009 §2.2: an invalid token is no error, so a client can't probe for valid ones
            const { status } = await revoke(metadata, 'not-a-token');

            expect(status).to.equal(200);
        });

        withServer.test('Can not revoke a JWT access token', async ({ metadata }) => {
            const tokens = await userTokens({
                clientId,
                redirectUri,
                resource,
                issuer: metadata.issuer,
                scope: 'notes:read',
            });

            const { status, body } = await revoke(metadata, tokens.access_token);

            expect(status).to.equal(400);
            expect(JSON.parse(body)).to.include({ error: 'unsupported_token_type' });
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

    suite('login_hint', () => {
        withServer.test('Signs in as the account it names', async ({ metadata }) => {
            const token = await userToken(metadata, { user: 'alice' });

            const { payload } = await jwtVerify(
                token,
                createRemoteJWKSet(new URL(metadata.jwks_uri)),
                { audience: resource }
            );
            expect(payload.sub).to.equal('alice');
        });
    });

    suite('Token exchange', () => {
        /**
         * Asks to exchange a token, as a service.
         *
         * @param metadata - The authorization server's metadata
         * @param params - Form parameters, over the defaults
         * @param client - Who asks
         * @returns The token endpoint's status and JSON body
         */
        const exchangeToken = async (
            metadata: Metadata,
            params: Readonly<Record<string, string | undefined>>,
            client: { readonly clientId: string; readonly clientSecret: string } = exchanger
        ): Promise<{
            readonly status: number;
            readonly body: Readonly<Record<string, unknown>>;
        }> => {
            const all: Readonly<Record<string, string | undefined>> = {
                grant_type: tokenExchangeGrant,
                subject_token_type: accessTokenType,
                resource: apiResource,
                ...params,
            };
            const response = await fetch(metadata.token_endpoint, {
                method: 'POST',
                headers: {
                    authorization: `Basic ${btoa([client.clientId, client.clientSecret].join(':'))}`,
                },
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

        withServer.test(
            "Issues a token for the resource asked for, as the user, with the user's scopes",
            async ({ server, metadata }) => {
                const subjectToken = await userToken(metadata, {
                    user: 'alice',
                    scope: 'notes:read notes:write',
                });

                const { status, body } = await exchangeToken(metadata, {
                    subject_token: subjectToken,
                });

                expect(status).to.equal(200);
                expect(body).to.include({
                    issued_token_type: accessTokenType,
                    token_type: 'Bearer',
                    scope: 'notes:read notes:write',
                });
                const token = body.access_token as string;
                expect(decodeProtectedHeader(token).typ).to.equal('at+jwt');
                const { payload } = await jwtVerify(
                    token,
                    createRemoteJWKSet(new URL(metadata.jwks_uri)),
                    { issuer: server.issuer, audience: apiResource }
                );
                expect(payload).to.deep.include({
                    sub: 'alice',
                    client_id: exchanger.clientId,
                    // The service, acting for the user (RFC 8693)
                    act: { sub: exchanger.clientId },
                    scope: 'notes:read notes:write',
                });
                const { payload: subject } = await jwtVerify(
                    subjectToken,
                    createRemoteJWKSet(new URL(metadata.jwks_uri))
                );
                expect(payload.exp).to.be.at.most(subject.exp!);
            }
        );

        withServer.test('Issues fewer scopes, when asked for fewer', async ({ metadata }) => {
            const { body } = await exchangeToken(metadata, {
                subject_token: await userToken(metadata, { scope: 'notes:read notes:write' }),
                scope: 'notes:read',
                requested_token_type: accessTokenType,
            });

            expect(body.scope).to.equal('notes:read');
        });

        withServer.test("Refuses more scopes than the user's", async ({ metadata }) => {
            const { status, body } = await exchangeToken(metadata, {
                subject_token: await userToken(metadata, { scope: 'notes:read' }),
                scope: 'notes:read notes:write',
            });

            expect(status).to.equal(400);
            expect(body.error).to.equal('invalid_scope');
        });

        withServer.test(
            'Refuses a token issued for anything but the service',
            async ({ metadata }) => {
                const { body: issued } = await exchangeToken(metadata, {
                    subject_token: await userToken(metadata),
                });

                // A token for the API, which the service was handed: not one to exchange
                const { status, body } = await exchangeToken(metadata, {
                    subject_token: issued.access_token as string,
                });

                expect(status).to.equal(400);
                expect(body.error).to.equal('invalid_grant');
            }
        );

        withServer.test('Refuses a token that is not one', async ({ metadata }) => {
            const { status, body } = await exchangeToken(metadata, { subject_token: 'forged' });

            expect(status).to.equal(400);
            expect(body.error).to.equal('invalid_grant');
        });

        for (const [name, params] of [
            [
                'subject_token_type',
                { subject_token_type: 'urn:ietf:params:oauth:token-type:id_token' },
            ],
            [
                'requested_token_type',
                { requested_token_type: 'urn:ietf:params:oauth:token-type:refresh_token' },
            ],
        ] as const) {
            withServer.test(
                `Refuses a ${name} other than an access token`,
                async ({ metadata }) => {
                    const { status, body } = await exchangeToken(metadata, {
                        subject_token: await userToken(metadata),
                        ...params,
                    });

                    expect(status).to.equal(400);
                    expect(body.error).to.equal('invalid_request');
                }
            );
        }

        for (const [name, target] of [
            ['no', undefined],
            ['an unknown', 'http://127.0.0.1:5/unknown'],
        ] as const) {
            withServer.test(`Refuses ${name} resource`, async ({ metadata }) => {
                const { status, body } = await exchangeToken(metadata, {
                    subject_token: await userToken(metadata),
                    resource: target,
                });

                expect(status).to.equal(400);
                expect(body.error).to.equal('invalid_target');
            });
        }

        withServer.test('Refuses a service not allowed to exchange', async ({ metadata }) => {
            const { status, body } = await exchangeToken(
                metadata,
                { subject_token: await userToken(metadata) },
                service
            );

            // Where RFC 6749 says `unauthorized_client`, oidc-provider says `invalid_request`
            expect(status).to.equal(400);
            expect(body).to.include({
                error: 'invalid_request',
                error_description: 'requested grant type is not allowed for this client',
            });
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

    suite('Only this machine', () => {
        test('Refuses to listen where other machines could reach it', async () => {
            await expect(
                listenDevAuthorizationServer({
                    hostname: '0.0.0.0',
                    resources: [],
                    clients: [],
                    services: [],
                    accountId: 'dev-user',
                })
            ).to.be.rejectedWith(
                DevAuthorizationServerNotLocalError,
                '0.0.0.0 is not this machine'
            );
        });

        test('Refuses an issuer that is not this machine', async () => {
            await expect(
                createDevAuthorizationServer({
                    issuer: 'https://auth.example',
                    resources: [],
                    clients: [],
                    services: [],
                    accountId: 'dev-user',
                })
            ).to.be.rejectedWith(DevAuthorizationServerNotLocalError);
        });

        test('Serves anywhere when asked to, dangerously', async () => {
            const server = await createDevAuthorizationServer({
                issuer: 'https://auth.example',
                resources: [],
                clients: [],
                services: [],
                accountId: 'dev-user',
                dangerouslyAllowNonLocal: true,
            });

            expect(server.issuer).to.equal('https://auth.example');
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

    suite('Device authorization', () => {
        /**
         * Starts a device authorization, as a device would.
         *
         * @param metadata - The authorization server's metadata
         * @param client - Who asks
         * @returns The endpoint's status and JSON body
         */
        const authorizeDevice = async (
            metadata: Metadata,
            client = deviceClientId
        ): Promise<{
            readonly status: number;
            readonly body: Readonly<Record<string, unknown>>;
        }> => {
            const response = await fetch(metadata.device_authorization_endpoint as string, {
                method: 'POST',
                body: new URLSearchParams({ client_id: client, scope: 'notes:read', resource }),
            });
            return {
                status: response.status,
                body: (await response.json()) as Record<string, unknown>,
            };
        };

        /**
         * Polls for the device's tokens, once.
         *
         * @param metadata - The authorization server's metadata
         * @param deviceCode - From the device authorization
         * @returns The token endpoint's status and JSON body
         */
        const poll = async (metadata: Metadata, deviceCode: unknown) =>
            exchange(metadata, {
                grant_type: deviceCodeGrant,
                client_id: deviceClientId,
                device_code: deviceCode as string,
                redirect_uri: undefined,
            });

        withServer.test(
            'Issues tokens to a device, once the user approves',
            async ({ server, metadata }) => {
                const { status, body: device } = await authorizeDevice(metadata);
                const pending = await poll(metadata, device.device_code);

                await approveDevice(device.verification_uri_complete as string);
                const { body: tokens } = await poll(metadata, device.device_code);

                expect(status).to.equal(200);
                expect(device).to.include({
                    verification_uri: `${server.issuer}/device`,
                    // RFC 8628's default, unless set
                    interval: 5,
                });
                expect(device.user_code).to.match(/^[A-Z]{4}-[A-Z]{4}$/v);
                expect(pending.body).to.include({ error: 'authorization_pending' });
                expect(tokens).to.include({ scope: 'notes:read' });
                expect(tokens.refresh_token).to.be.a('string');
                const { payload } = await jwtVerify(
                    tokens.access_token as string,
                    createRemoteJWKSet(new URL(metadata.jwks_uri)),
                    { issuer: server.issuer, audience: resource }
                );
                expect(payload).to.include({ sub: 'dev-user', client_id: deviceClientId });
            }
        );

        withServer.test('Refuses a device the user denies', async ({ metadata }) => {
            const { body: device } = await authorizeDevice(metadata);

            await approveDevice(device.verification_uri_complete as string, { deny: true });
            const { status, body } = await poll(metadata, device.device_code);

            expect(status).to.equal(400);
            expect(body).to.include({ error: 'access_denied' });
        });

        withServer.test('Refuses a client not allowed it', async ({ metadata }) => {
            const { status, body } = await authorizeDevice(metadata, clientId);

            expect(status).to.equal(400);
            // RFC 6749 would say `unauthorized_client`; oidc-provider says this, as for every grant
            expect(body).to.include({ error: 'invalid_request' });
        });

        withServer.test('Asks for the code, when not given one', async ({ server }) => {
            const page = await fetch(`${server.issuer}/device`);

            expect(await page.text()).to.include('Enter the code your device shows.');
        });

        withServer.test('Refuses a code it did not give', async ({ server }) => {
            await expect(
                approveDevice(`${server.issuer}/device?user_code=WRONG-CODE`)
            ).to.be.rejectedWith(DevAuthorizationFlowError, '/device: refused the code');
        });

        test('Names the interval it is given', async () => {
            const server = await listenDevAuthorizationServer({
                resources: [{ url: resource, scopes: ['notes:read'] }],
                clients: [
                    {
                        clientId: deviceClientId,
                        redirectUris: [registeredRedirectUri],
                        deviceAuthorization: true,
                    },
                ],
                services: [],
                accountId: 'dev-user',
                deviceInterval: 1,
            });
            try {
                const response = await fetch(
                    `${server.issuer}/.well-known/oauth-authorization-server`
                );
                const { body } = await authorizeDevice((await response.json()) as Metadata);

                expect(body).to.include({ interval: 1 });
            } finally {
                await server.close();
            }
        });

        withServer.test('approveDevice rejects a page with no form', async ({ server }) => {
            await expect(approveDevice(`${server.issuer}/nowhere`)).to.be.rejectedWith(
                DevAuthorizationFlowError,
                '/nowhere: answered 404, not a form'
            );
        });
    });

    suite('userTokens', () => {
        withServer.test(
            'Signs a user in, for a token for the resource',
            async ({ server, metadata }) => {
                const tokens = await userTokens({
                    clientId,
                    redirectUri,
                    resource,
                    issuer: server.issuer,
                    scope: 'notes:read notes:write',
                    user: 'alice',
                });

                const { payload } = await jwtVerify(
                    tokens.access_token,
                    createRemoteJWKSet(new URL(metadata.jwks_uri)),
                    { issuer: server.issuer, audience: resource }
                );
                expect(payload).to.include({
                    sub: 'alice',
                    client_id: clientId,
                    scope: 'notes:read notes:write',
                });
                expect(tokens).to.include({
                    token_type: 'Bearer',
                    scope: 'notes:read notes:write',
                });
                expect(tokens.refresh_token).to.be.a('string');
            }
        );

        withServer.test('Signs in as the default account', async ({ server }) => {
            const tokens = await userTokens({
                clientId,
                redirectUri,
                resource,
                issuer: server.issuer,
                scope: 'notes:read',
            });

            expect(decodeJwt(tokens.access_token).sub).to.equal('dev-user');
        });

        withServer.test('Rejects when the authorization is refused', async ({ server }) => {
            // No scope at all: the dev login has nothing to grant
            await expect(
                userTokens({ clientId, redirectUri, resource, issuer: server.issuer, scope: '' })
            ).to.be.rejectedWith(
                DevAuthorizationFlowError,
                '/auth: refused the authorization: access_denied'
            );
        });

        test('Rejects when the token request is refused', async () => {
            // An issuer that redirects straight back with a code, and refuses it
            const issuer = createServer((request, response) => {
                if (request.url!.startsWith('/auth')) {
                    response.writeHead(302, { location: `${redirectUri}?code=bad` }).end();
                } else {
                    response
                        .writeHead(400, { 'content-type': 'application/json' })
                        .end(JSON.stringify({ error: 'invalid_grant' }));
                }
            });
            issuer.listen(0, '127.0.0.1');
            await once(issuer, 'listening');
            const { port } = issuer.address() as AddressInfo;
            try {
                await expect(
                    userTokens({
                        clientId,
                        redirectUri,
                        resource,
                        issuer: `http://127.0.0.1:${port}`,
                        scope: 'notes:read',
                    })
                ).to.be.rejectedWith(
                    DevAuthorizationFlowError,
                    '/token: refused the token request: invalid_grant'
                );
            } finally {
                issuer.close();
                issuer.closeAllConnections();
            }
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
                await expect(approveDevice(`http://127.0.0.1:${port}/`)).to.be.rejectedWith(
                    DevAuthorizationFlowError,
                    '/again: more than 10 redirects'
                );
            } finally {
                loop.close();
                loop.closeAllConnections();
            }
        });
    });
});
