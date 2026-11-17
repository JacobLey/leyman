import type { ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ListeningAuthorizationServer } from 'oauth-dev-server';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { drizzle } from 'drizzle-orm/node-postgres';
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { Pool } from 'pg';
import { NotesClient } from '@leyman/demo-openapi-client';
import { notes, NotesAuthorizationServerError } from '@leyman/demo-openapi-server';
import { expect } from '@leyman/expect';
import { suite } from 'mocha-chain';
import { listenDevAuthorizationServer, userTokens } from 'oauth-dev-server';
import { withDatabase } from '#test/helpers/database.js';
import { implementations } from '#test/helpers/implementations.js';

const textEncoder = new TextEncoder();

/**
 * The API's resource identifier. Any URI will do: it names the API in tokens, and is never fetched.
 */
const audience = 'https://notes.test';

/**
 * A native app users sign in to the API with.
 */
const app = { clientId: 'app', redirectUris: ['http://127.0.0.1/callback'] };
const redirectUri = 'http://127.0.0.1:1/callback';
const service = { clientId: 'service', clientSecret: 'service-secret', scopes: ['notes:read'] };

/**
 * A user's token, by the authorization code flow, with the dev login playing the user.
 *
 * @param server - The authorization server
 * @param options - Who signs in, and the resource and scopes to ask for
 * @returns The access token
 */
const userToken = async (
    server: ListeningAuthorizationServer,
    options: { readonly user?: string; readonly resource?: string; readonly scope?: string } = {}
): Promise<string> => {
    const { user = 'dolly', resource = audience, scope = 'notes:read' } = options;
    const tokens = await userTokens({
        user,
        resource,
        scope,
        redirectUri,
        issuer: server.issuer,
        clientId: app.clientId,
    });
    return tokens.access_token;
};

/**
 * A service's own token, with the client credentials grant: valid, but no user's.
 *
 * @param server - The authorization server
 * @returns The access token
 */
const serviceToken = async (server: ListeningAuthorizationServer): Promise<string> => {
    const response = await fetch(`${server.issuer}/token`, {
        method: 'POST',
        headers: {
            authorization: `Basic ${textEncoder.encode([service.clientId, service.clientSecret].join(':')).toBase64()}`,
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            resource: audience,
            scope: 'notes:read',
        }),
    });
    const { access_token: token } = (await response.json()) as { readonly access_token: string };
    return token;
};

// Black-box tests, through HTTP alone, so each server is held to the same expectations
for (const implementation of implementations) {
    suite(`JWT authentication on ${implementation.name}`, () => {
        /**
         * The app on its own database, accepting tokens from a dev authorization server.
         */
        const withServer = withDatabase().beforeEach(async ({ database }) => {
            const authorization = await listenDevAuthorizationServer({
                resources: [
                    { url: audience, scopes: ['notes:read', 'notes:write'] },
                    { url: 'https://other.test', scopes: ['notes:read'] },
                ],
                clients: [app],
                services: [service],
                accountId: 'dev-user',
            });
            // The test's own connection, to read rows directly
            const pool = new Pool({ connectionString: database.url, max: 1 });
            const db = drizzle({ client: pool });
            const served = await implementation.start({
                databaseUrl: database.url,
                authentication: { issuer: authorization.issuer, audience },
            });
            /**
             * A client with a token.
             *
             * @param token - Its bearer token
             * @returns A client that sends it
             */
            const clientWith = (token: string): NotesClient =>
                new NotesClient({ baseUrl: served.url, token });
            return { authorization, db, pool, served, clientWith };
        });
        withServer.afterEach(async ({ authorization, pool, served }) => {
            await served.close();
            await authorization.close();
            await pool.end();
        });

        withServer.test('Accepts a token with the scope', async ({ authorization, clientWith }) => {
            const client = clientWith(await userToken(authorization));

            expect(await client.call('listNotes', {})).to.deep.equal({
                status: 200,
                body: { items: [] },
            });
        });

        withServer.test(
            'Accepts a token with every scope',
            async ({ authorization, clientWith }) => {
                const client = clientWith(
                    await userToken(authorization, { scope: 'notes:read notes:write' })
                );

                const created = await client.call('createNote', {
                    body: { title: 'Dolly', body: '' },
                });

                expect(created.status).to.equal(201);
            }
        );

        withServer.test(
            "Acts as the token's subject",
            async ({ authorization, clientWith, db }) => {
                const token = await userToken(authorization, { scope: 'notes:write' });
                const client = clientWith(token);

                await client.call('createNote', { body: { title: 'Dolly', body: '' } });

                const [row] = await db.select().from(notes);
                expect(decodeJwt(token).sub).to.equal('dolly');
                expect(row).to.include({ owner: 'dolly' });
            }
        );

        withServer.test(
            'Refuses a token without the scope, naming it',
            async ({ authorization, served }) => {
                const token = await userToken(authorization);

                const response = await fetch(`${served.url}/notes`, {
                    method: 'POST',
                    headers: {
                        authorization: `Bearer ${token}`,
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({ title: 'Dolly', body: '' }),
                });

                expect(response.status).to.equal(403);
                expect(response.headers.get('www-authenticate')).to.equal(
                    'Bearer error="insufficient_scope", scope="notes:write"'
                );
                expect(await response.json()).to.include({ code: 'insufficient_scope' });
            }
        );

        withServer.test('Refuses a token with no scope', async ({ authorization, clientWith }) => {
            // Signed in, with none of the API's scopes: a login asks for at least one scope
            const client = clientWith(await userToken(authorization, { scope: 'openid' }));

            const listed = await client.call('listNotes', {});

            expect(listed.status).to.equal(403);
        });

        withServer.test(
            'Refuses a token for another audience, from the same issuer',
            async ({ authorization, clientWith }) => {
                const client = clientWith(
                    await userToken(authorization, { resource: 'https://other.test' })
                );

                const listed = await client.call('listNotes', {});

                expect(listed.status).to.equal(401);
            }
        );

        withServer.test(
            "Refuses a service's own token, which is no user's",
            async ({ authorization, clientWith }) => {
                // Its subject is the service (RFC 9068): accepting it would act as a user named after it
                const client = clientWith(await serviceToken(authorization));

                const listed = await client.call('listNotes', {});

                expect(listed.status).to.equal(401);
            }
        );

        withServer.test('Refuses a token that is not a JWT', async ({ clientWith }) => {
            const listed = await clientWith('not-a-jwt').call('listNotes', {});

            expect(listed.status).to.equal(401);
        });

        suite('Protected Resource Metadata', () => {
            /**
             * The app, saying who issues its tokens.
             */
            const withMetadata = withDatabase().beforeEach(async ({ database }) => {
                const served = await implementation.start({
                    databaseUrl: database.url,
                    // Any authentication: the metadata and challenges don't depend on it
                    authentication: { tokens: [{ token: 'token', subject: 'dev-user' }] },
                    protectedResource: {
                        resource: `${audience}/api`,
                        authorizationServers: ['https://issuer.test'],
                    },
                });
                return { served };
            });
            withMetadata.afterEach(async ({ served }) => {
                await served.close();
            });

            withMetadata.test('Is served where RFC 9728 puts it', async ({ served }) => {
                const response = await fetch(
                    `${served.url}/.well-known/oauth-protected-resource/api`
                );

                expect(await response.json()).to.deep.equal({
                    resource: `${audience}/api`,
                    authorization_servers: ['https://issuer.test'],
                    scopes_supported: ['notes:read', 'notes:write'],
                    bearer_methods_supported: ['header'],
                });
            });

            withMetadata.test('Is pointed to by every challenge', async ({ served }) => {
                const missing = await fetch(`${served.url}/notes`);
                const invalid = await fetch(`${served.url}/notes`, {
                    headers: { authorization: 'Bearer not-a-jwt' },
                });

                expect([
                    missing.headers.get('www-authenticate'),
                    invalid.headers.get('www-authenticate'),
                ]).to.deep.equal([
                    `Bearer resource_metadata="${audience}/.well-known/oauth-protected-resource/api"`,
                    `Bearer resource_metadata="${audience}/.well-known/oauth-protected-resource/api", error="invalid_token"`,
                ]);
            });
        });

        suite('Claims', () => {
            /**
             * The app, trusting an issuer of the test's own, which signs whatever claims a test gives it.
             */
            const withIssuer = withDatabase().beforeEach(async ({ database }) => {
                const { publicKey, privateKey } = await generateKeyPair('ES256');
                const jwk = { ...(await exportJWK(publicKey)), kid: 'key', alg: 'ES256' };
                const issuer = createServer();
                issuer.listen(0, '127.0.0.1');
                await once(issuer, 'listening');
                const url = `http://127.0.0.1:${(issuer.address() as AddressInfo).port}`;
                issuer.on('request', (request, response: ServerResponse) => {
                    const body =
                        request.url === '/jwks'
                            ? { keys: [jwk] }
                            : { issuer: url, jwks_uri: `${url}/jwks` };
                    response
                        .writeHead(200, { 'content-type': 'application/json' })
                        .end(JSON.stringify(body));
                });
                const served = await implementation.start({
                    databaseUrl: database.url,
                    authentication: { issuer: url, audience },
                });
                /**
                 * A token from the issuer, for the API, as dolly, with its scope.
                 *
                 * @param hasExpiry - Whether it has an `exp`
                 * @returns The access token
                 */
                const sign = async (hasExpiry: boolean): Promise<string> => {
                    const token = new SignJWT({ scope: 'notes:read' });
                    token
                        .setProtectedHeader({ alg: 'ES256', typ: 'at+jwt', kid: 'key' })
                        .setIssuer(url)
                        .setAudience(audience)
                        .setSubject('dolly')
                        .setIssuedAt();
                    if (hasExpiry) {
                        token.setExpirationTime('1m');
                    }
                    return token.sign(privateKey);
                };
                return { issuer, served, sign };
            });
            withIssuer.afterEach(async ({ issuer, served }) => {
                await served.close();
                issuer.close();
                issuer.closeAllConnections();
            });

            withIssuer.test('Accepts a token that expires', async ({ served, sign }) => {
                const client = new NotesClient({ baseUrl: served.url, token: await sign(true) });

                const listed = await client.call('listNotes', {});

                expect(listed.status).to.equal(200);
            });

            // RFC 9068 requires exp (https://www.rfc-editor.org/rfc/rfc9068#section-2.2): a token without one would be
            // good forever
            withIssuer.test('Refuses a token that never expires', async ({ served, sign }) => {
                const client = new NotesClient({ baseUrl: served.url, token: await sign(false) });

                const listed = await client.call('listNotes', {});

                expect(listed.status).to.equal(401);
            });
        });

        suite('Discovery', () => {
            /**
             * The app, trusting an issuer whose discovery fails.
             */
            const withIssuer = withDatabase().beforeEach(async ({ database }) => {
                const authorization = await listenDevAuthorizationServer({
                    resources: [{ url: audience, scopes: ['notes:read'] }],
                    clients: [app],
                    services: [],
                    accountId: 'dev-user',
                });
                const serveWith = async (issuer: string) =>
                    implementation.start({
                        databaseUrl: database.url,
                        authentication: { issuer, audience },
                    });
                return { authorization, serveWith };
            });
            withIssuer.afterEach(async ({ authorization }) => {
                await authorization.close();
            });

            withIssuer.test(
                'Fails, and tries again, when the issuer has no discovery document',
                async ({ authorization, serveWith }) => {
                    // Nothing is served there: a 404
                    const served = await serveWith(`${authorization.issuer}/nowhere`);
                    try {
                        const list = async (): Promise<number> => {
                            const response = await fetch(`${served.url}/notes`, {
                                headers: {
                                    authorization: `Bearer ${await userToken(authorization)}`,
                                },
                            });
                            return response.status;
                        };

                        expect(await list()).to.equal(500);
                        expect(await list()).to.equal(500);
                        const errors = await served.close();
                        expect(errors).to.have.length(2);
                        expect(errors[0]?.message).to.include('discovery answered 404');
                        if (implementation.name === 'TypeScript') {
                            expect(errors[0]).to.be.instanceOf(NotesAuthorizationServerError);
                        }
                    } finally {
                        await served.close();
                    }
                }
            );

            withIssuer.test(
                'Fails when the discovery document names another issuer',
                async ({ authorization, serveWith }) => {
                    // The document is found (the trailing slash is dropped to find it), but names the issuer without it
                    const served = await serveWith(`${authorization.issuer}/`);
                    try {
                        const response = await fetch(`${served.url}/notes`, {
                            headers: {
                                authorization: `Bearer ${await userToken(authorization)}`,
                            },
                        });

                        expect(response.status).to.equal(500);
                        const errors = await served.close();
                        expect(errors[0]?.message).to.include('named another issuer');
                    } finally {
                        await served.close();
                    }
                }
            );

            withIssuer.test(
                "Fails when the issuer's keys can't be fetched",
                async ({ authorization, serveWith }) => {
                    // A discovery document of its own, naming keys where nothing listens
                    const issuer = createServer();
                    issuer.listen(0, '127.0.0.1');
                    await once(issuer, 'listening');
                    const url = `http://127.0.0.1:${(issuer.address() as AddressInfo).port}`;
                    issuer.on('request', (_request, response: ServerResponse) => {
                        response
                            .writeHead(200, { 'content-type': 'application/json' })
                            .end(
                                JSON.stringify({ issuer: url, jwks_uri: 'http://127.0.0.1:1/jwks' })
                            );
                    });
                    const served = await serveWith(url);
                    try {
                        const response = await fetch(`${served.url}/notes`, {
                            headers: {
                                authorization: `Bearer ${await userToken(authorization)}`,
                            },
                        });

                        expect(response.status).to.equal(500);
                        const errors = await served.close();
                        expect(errors).to.have.length(1);
                        if (implementation.name === 'TypeScript') {
                            // Fetch's, for a connection refused
                            expect(errors[0]).to.be.instanceOf(TypeError);
                        }
                    } finally {
                        await served.close();
                        issuer.close();
                        issuer.closeAllConnections();
                    }
                }
            );
            withIssuer.test(
                'Fails, rather than refusing the token, when its keys answer an error',
                async ({ authorization, serveWith }) => {
                    // Discovery works, but the keys answer 503: the issuer is down, the token may well be fine
                    const issuer = createServer();
                    issuer.listen(0, '127.0.0.1');
                    await once(issuer, 'listening');
                    const url = `http://127.0.0.1:${(issuer.address() as AddressInfo).port}`;
                    issuer.on('request', (request, response: ServerResponse) => {
                        if (request.url === '/jwks') {
                            response.writeHead(503).end();
                            return;
                        }
                        response
                            .writeHead(200, { 'content-type': 'application/json' })
                            .end(JSON.stringify({ issuer: url, jwks_uri: `${url}/jwks` }));
                    });
                    const served = await serveWith(url);
                    try {
                        const response = await fetch(`${served.url}/notes`, {
                            headers: {
                                authorization: `Bearer ${await userToken(authorization)}`,
                            },
                        });

                        expect(response.status).to.equal(500);
                        expect(await served.close()).to.have.length(1);
                    } finally {
                        await served.close();
                        issuer.close();
                        issuer.closeAllConnections();
                    }
                }
            );
        });
    });
}
