import type { ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ListeningAuthorizationServer } from 'oauth-dev-server';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { drizzle } from 'drizzle-orm/node-postgres';
import { decodeJwt } from 'jose';
import { Pool } from 'pg';
import { NotesClient } from '@leyman/demo-openapi-client';
import {
    appConfigId,
    createNotesApp,
    databaseId,
    jwtAuthenticator,
    jwtAuthenticatorBinding,
    notes,
    notesAppId,
    NotesAuthorizationServerError,
    notesModule,
    staticTokens,
} from '@leyman/demo-openapi-server';
import { expect } from '@leyman/expect';
import { bind, createContainer } from 'haywire';
import { suite } from 'mocha-chain';
import { listenDevAuthorizationServer } from 'oauth-dev-server';
import { withDatabase } from '../helpers/database.js';
import { listen } from '../helpers/serve.js';

/**
 * The API's resource identifier. Any URI will do: it names the API in tokens, and is never fetched.
 */
const audience = 'https://notes.test';

const reader = { clientId: 'reader', clientSecret: 'reader-secret', scopes: ['notes:read'] };
const writer = {
    clientId: 'writer',
    clientSecret: 'writer-secret',
    scopes: ['notes:read', 'notes:write'],
};

/**
 * A token for a service, with the client credentials grant.
 *
 * @param server - The authorization server
 * @param service - Which service
 * @param options - The resource and scopes to ask for
 * @returns The access token
 */
const serviceToken = async (
    server: ListeningAuthorizationServer,
    service: typeof reader,
    options: { readonly resource?: string; readonly scope?: string } = {}
): Promise<string> => {
    const { resource = audience, scope = service.scopes.join(' ') } = options;
    const response = await fetch(`${server.issuer}/token`, {
        method: 'POST',
        headers: {
            authorization: `Basic ${btoa([service.clientId, service.clientSecret].join(':'))}`,
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', resource, scope }),
    });
    const { access_token: token } = (await response.json()) as { readonly access_token: string };
    return token;
};

suite('JWT authentication', () => {
    /**
     * The app on its own database, accepting tokens from a dev authorization server.
     */
    const withServer = withDatabase().beforeEach(async ({ database }) => {
        const authorization = await listenDevAuthorizationServer({
            resources: [
                { url: audience, scopes: ['notes:read', 'notes:write'] },
                { url: 'https://other.test', scopes: ['notes:read'] },
            ],
            clients: [],
            services: [reader, writer],
            accountId: 'dev-user',
        });
        const pool = new Pool({ connectionString: database.url, max: 2 });
        const db = drizzle({ client: pool });
        const errors: Error[] = [];
        const served = await listen(
            createContainer(
                notesModule
                    .addBinding(bind(databaseId).withInstance(db))
                    .addBinding(jwtAuthenticatorBinding({ issuer: authorization.issuer, audience }))
                    .addBinding(
                        bind(appConfigId).withInstance({
                            onError: error => {
                                errors.push(error);
                            },
                        })
                    )
            ).get(notesAppId)
        );
        /**
         * A client with a token.
         *
         * @param token - Its bearer token
         * @returns A client that sends it
         */
        const clientWith = (token: string): NotesClient =>
            new NotesClient({ baseUrl: served.url, token });
        return { authorization, db, pool, served, errors, clientWith };
    });
    withServer.afterEach(async ({ authorization, pool, served }) => {
        await served.close();
        await authorization.close();
        await pool.end();
    });

    withServer.test('Accepts a token with the scope', async ({ authorization, clientWith }) => {
        const client = clientWith(await serviceToken(authorization, reader));

        expect(await client.call('listNotes', {})).to.deep.equal({
            status: 200,
            body: { items: [] },
        });
    });

    withServer.test('Accepts a token with every scope', async ({ authorization, clientWith }) => {
        const client = clientWith(await serviceToken(authorization, writer));

        const created = await client.call('createNote', { body: { title: 'Dolly', body: '' } });

        expect(created.status).to.equal(201);
    });

    withServer.test("Acts as the token's subject", async ({ authorization, clientWith, db }) => {
        const token = await serviceToken(authorization, writer);
        const client = clientWith(token);

        await client.call('createNote', { body: { title: 'Dolly', body: '' } });

        const [row] = await db.select().from(notes);
        // A service's token is for itself (RFC 9068)
        expect(row).to.include({ owner: decodeJwt(token).sub });
    });

    withServer.test(
        'Refuses a token without the scope, naming it',
        async ({ authorization, served }) => {
            const token = await serviceToken(authorization, reader);

            const response = await fetch(`${served.url}/notes`, {
                method: 'POST',
                headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
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
        const client = clientWith(await serviceToken(authorization, reader, { scope: '' }));

        const listed = await client.call('listNotes', {});

        expect(listed.status).to.equal(403);
    });

    withServer.test(
        'Refuses a token for another audience, from the same issuer',
        async ({ authorization, clientWith }) => {
            const client = clientWith(
                await serviceToken(authorization, reader, { resource: 'https://other.test' })
            );

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
            const pool = new Pool({ connectionString: database.url, max: 2 });
            const served = await listen(
                createNotesApp({
                    db: drizzle({ client: pool }),
                    // Any authenticator: the metadata and challenges don't depend on it
                    authenticate: staticTokens([{ token: 'token', subject: 'dev-user' }]),
                    protectedResource: {
                        resource: `${audience}/api`,
                        authorizationServers: ['https://issuer.test'],
                    },
                    onError: () => {},
                })
            );
            return { pool, served };
        });
        withMetadata.afterEach(async ({ pool, served }) => {
            await served.close();
            await pool.end();
        });

        withMetadata.test('Is served where RFC 9728 puts it', async ({ served }) => {
            const response = await fetch(`${served.url}/.well-known/oauth-protected-resource/api`);

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

    suite('Discovery', () => {
        /**
         * The app, trusting an issuer whose discovery fails.
         */
        const withIssuer = withDatabase().beforeEach(async ({ database }) => {
            const authorization = await listenDevAuthorizationServer({
                resources: [{ url: audience, scopes: ['notes:read'] }],
                clients: [],
                services: [reader],
                accountId: 'dev-user',
            });
            const pool = new Pool({ connectionString: database.url, max: 2 });
            const errors: Error[] = [];
            const serveWith = async (issuer: string) =>
                listen(
                    createNotesApp({
                        db: drizzle({ client: pool }),
                        authenticate: jwtAuthenticator({ issuer, audience }),
                        onError: error => {
                            errors.push(error);
                        },
                    })
                );
            return { authorization, pool, errors, serveWith };
        });
        withIssuer.afterEach(async ({ authorization, pool }) => {
            await authorization.close();
            await pool.end();
        });

        withIssuer.test(
            'Fails, and tries again, when the issuer has no discovery document',
            async ({ authorization, errors, serveWith }) => {
                // Nothing is served there: a 404
                const served = await serveWith(`${authorization.issuer}/nowhere`);
                try {
                    const list = async (): Promise<number> => {
                        const response = await fetch(`${served.url}/notes`, {
                            headers: {
                                authorization: `Bearer ${await serviceToken(authorization, reader)}`,
                            },
                        });
                        return response.status;
                    };

                    expect(await list()).to.equal(500);
                    expect(await list()).to.equal(500);
                    expect(errors).to.have.length(2);
                    expect(errors[0]).to.be.instanceOf(NotesAuthorizationServerError);
                    expect(errors[0]?.message).to.include('discovery answered 404');
                } finally {
                    await served.close();
                }
            }
        );

        withIssuer.test(
            'Fails when the discovery document names another issuer',
            async ({ authorization, errors, serveWith }) => {
                // The document is found (the trailing slash is dropped to find it), but names the issuer without it
                const served = await serveWith(`${authorization.issuer}/`);
                try {
                    const response = await fetch(`${served.url}/notes`, {
                        headers: {
                            authorization: `Bearer ${await serviceToken(authorization, reader)}`,
                        },
                    });

                    expect(response.status).to.equal(500);
                    expect(errors[0]?.message).to.include('named another issuer');
                } finally {
                    await served.close();
                }
            }
        );

        withIssuer.test(
            "Fails when the issuer's keys can't be fetched",
            async ({ authorization, errors, serveWith }) => {
                // A discovery document of its own, naming keys where nothing listens
                const issuer = createServer();
                issuer.listen(0, '127.0.0.1');
                await once(issuer, 'listening');
                const url = `http://127.0.0.1:${(issuer.address() as AddressInfo).port}`;
                issuer.on('request', (_request, response: ServerResponse) => {
                    response
                        .writeHead(200, { 'content-type': 'application/json' })
                        .end(JSON.stringify({ issuer: url, jwks_uri: 'http://127.0.0.1:1/jwks' }));
                });
                const served = await serveWith(url);
                try {
                    const response = await fetch(`${served.url}/notes`, {
                        headers: {
                            authorization: `Bearer ${await serviceToken(authorization, reader)}`,
                        },
                    });

                    expect(response.status).to.equal(500);
                    expect(errors[0]).to.be.instanceOf(TypeError);
                } finally {
                    await served.close();
                    issuer.close();
                    issuer.closeAllConnections();
                }
            }
        );
        withIssuer.test(
            'Fails, rather than refusing the token, when its keys answer an error',
            async ({ authorization, errors, serveWith }) => {
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
                            authorization: `Bearer ${await serviceToken(authorization, reader)}`,
                        },
                    });

                    expect(response.status).to.equal(500);
                    expect(errors).to.have.length(1);
                } finally {
                    await served.close();
                    issuer.close();
                    issuer.closeAllConnections();
                }
            }
        );
    });
});
