import type { ListeningAuthorizationServer } from 'oauth-dev-server';
import {
    createMcpApp,
    jwtVerifier,
    NotesMcpAuthorizationServerError,
} from '@leyman/demo-agents-mcp';
import { NotesClient } from '@leyman/demo-openapi-client';
import { expect } from '@leyman/expect';
import { suite } from 'mocha-chain';
import { connectAgent } from '../helpers/agent.js';
import { listen } from '../helpers/serve.js';
import { apiAudience, mcpService, withStack } from '../helpers/stack.js';

/**
 * A token for a service, with the client credentials grant: a quick way to a valid token for any resource.
 *
 * @param authorization - The authorization server
 * @param resource - What the token is for
 * @param scope - What it may do
 * @returns The access token
 */
const serviceToken = async (
    authorization: ListeningAuthorizationServer,
    resource: string,
    scope: string
): Promise<string> => {
    const response = await fetch(`${authorization.issuer}/token`, {
        method: 'POST',
        headers: {
            authorization: `Basic ${btoa([mcpService.clientId, mcpService.clientSecret].join(':'))}`,
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', resource, scope }),
    });
    const { access_token: token } = (await response.json()) as { readonly access_token: string };
    return token;
};

/**
 * A JSON-RPC request to the server, as raw HTTP.
 *
 * @param url - The MCP server's
 * @param headers - Over the defaults
 * @returns The response
 */
const post = async (
    url: string,
    headers: Readonly<Record<string, string>> = {}
): Promise<Response> =>
    fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            ...headers,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });

suite('Authorization', () => {
    const withServers = withStack();

    suite('Protected Resource Metadata', () => {
        withServers.test(
            'Is served where RFC 9728 puts it',
            async ({ origin, url, authorization }) => {
                const response = await fetch(`${origin}/.well-known/oauth-protected-resource/mcp`);

                expect(await response.json()).to.deep.equal({
                    resource: url,
                    authorization_servers: [authorization.issuer],
                    scopes_supported: ['notes:read'],
                    bearer_methods_supported: ['header'],
                    resource_name: 'Notes',
                });
                expect(response.headers.get('access-control-allow-origin')).to.equal('*');
            }
        );
    });

    suite('Without a token', () => {
        withServers.test('Answers 401, pointing to the metadata', async ({ origin, url }) => {
            const response = await post(url);

            expect(response.status).to.equal(401);
            // No error code: a request without a token has nothing wrong with its token (RFC 6750)
            expect(response.headers.get('www-authenticate')).to.equal(
                `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="notes:read"`
            );
        });

        withServers.test(
            'Refuses a body larger than any tool takes, once authorized',
            async ({ url, authorization }) => {
                const token = await serviceToken(authorization, url, 'notes:read');

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        authorization: `Bearer ${token}`,
                        'content-type': 'application/json',
                        accept: 'application/json, text/event-stream',
                    },
                    body: JSON.stringify({ padding: 'x'.repeat(200 * 1024) }),
                });

                expect(response.status).to.equal(413);
            }
        );
    });

    suite('With a token', () => {
        withServers.test('Accepts one for the server', async ({ url, authorization }) => {
            const token = await serviceToken(authorization, url, 'notes:read');

            const response = await post(url, { authorization: `Bearer ${token}` });

            expect(response.status).to.equal(200);
        });

        withServers.test(
            'Refuses one for another service, from the same issuer',
            async ({ url, authorization }) => {
                // E.g. the MCP server's own token for the API, were it ever sent here
                const token = await serviceToken(authorization, apiAudience, 'notes:read');

                const response = await post(url, { authorization: `Bearer ${token}` });

                expect(response.status).to.equal(401);
                expect(response.headers.get('www-authenticate')).to.include(
                    'error="invalid_token"'
                );
            }
        );

        withServers.test(
            'Refuses one without the scope to connect',
            async ({ url, authorization }) => {
                const token = await serviceToken(authorization, url, 'notes:write');

                const response = await post(url, { authorization: `Bearer ${token}` });

                expect(response.status).to.equal(403);
                expect(response.headers.get('www-authenticate')).to.include(
                    'error="insufficient_scope"'
                );
            }
        );

        withServers.test('Refuses one with no scope at all', async ({ url, authorization }) => {
            const token = await serviceToken(authorization, url, '');

            const response = await post(url, { authorization: `Bearer ${token}` });

            expect(response.status).to.equal(403);
        });

        withServers.test('Refuses one that is not a JWT', async ({ url }) => {
            const response = await post(url, { authorization: 'Bearer not-a-jwt' });

            expect(response.status).to.equal(401);
        });
    });

    suite('DNS rebinding', () => {
        withServers.test('Refuses another Host', async ({ url, authorization }) => {
            const token = await serviceToken(authorization, url, 'notes:read');

            const response = await post(url.replace('127.0.0.1', 'localhost'), {
                authorization: `Bearer ${token}`,
            });

            expect(response.status).to.equal(403);
        });

        withServers.test('Refuses another Origin', async ({ url, authorization }) => {
            const token = await serviceToken(authorization, url, 'notes:read');

            const response = await post(url, {
                authorization: `Bearer ${token}`,
                origin: 'https://evil.test',
            });

            expect(response.status).to.equal(403);
        });
    });

    suite('An agent', () => {
        withServers.test('Is sent to authorize for the server, with PKCE', async ({ url }) => {
            const agent = await connectAgent(url);
            try {
                const [authorization] = agent.provider.authorizations;

                expect(authorization?.searchParams.get('resource')).to.equal(url);
                expect(authorization?.searchParams.get('code_challenge_method')).to.equal('S256');
            } finally {
                await agent.close();
            }
        });
    });

    suite('When the issuer cannot be used', () => {
        /**
         * The MCP server, verifying tokens from an issuer that can't be used, served.
         */
        const withBroken = withServers.beforeEach(async ({ url }) => {
            const errors: Error[] = [];
            const served = await listen();
            const serveWith = (issuer: string): void => {
                served.use(
                    createMcpApp(
                        () => new NotesClient({ baseUrl: 'http://127.0.0.1:1' }),
                        jwtVerifier({ audience: url, issuer }),
                        {
                            issuer,
                            resourceUrl: url,
                            allowedHosts: ['127.0.0.1'],
                            onError: error => {
                                errors.push(error);
                            },
                        }
                    ).fetch
                );
            };
            return { errors, served, serveWith };
        });
        withBroken.afterEach(async ({ served }) => {
            await served.close();
        });

        withBroken.test(
            'Answers 500 when it has no discovery document, and reports why',
            async ({ authorization, url, errors, served, serveWith }) => {
                serveWith(`${authorization.issuer}/nowhere`);
                const token = await serviceToken(authorization, url, 'notes:read');

                const response = await post(`${served.url}/mcp`, {
                    authorization: `Bearer ${token}`,
                });

                expect(response.status).to.equal(500);
                expect(errors[0]).to.be.instanceOf(NotesMcpAuthorizationServerError);
            }
        );

        withBroken.test(
            'Answers 500 when its keys answer an error, rather than refusing the token',
            async ({ authorization, url, errors, served, serveWith }) => {
                // Discovery works, but the keys answer 503: the issuer is down, the token may well be fine
                const issuer = await listen();
                issuer.use(({ url: requested }) =>
                    URL.parse(requested)?.pathname === '/jwks'
                        ? new Response(null, { status: 503 })
                        : Response.json({
                              issuer: issuer.url,
                              jwks_uri: `${issuer.url}/jwks`,
                              token_endpoint: `${issuer.url}/token`,
                          })
                );
                try {
                    serveWith(issuer.url);
                    const token = await serviceToken(authorization, url, 'notes:read');

                    const response = await post(`${served.url}/mcp`, {
                        authorization: `Bearer ${token}`,
                    });

                    expect(response.status).to.equal(500);
                    expect(errors).to.have.length(1);
                } finally {
                    await issuer.close();
                }
            }
        );

        withBroken.test(
            "Answers 500 when its keys can't be fetched, and reports why",
            async ({ authorization, url, errors, served, serveWith }) => {
                // A discovery document of its own, naming keys where nothing listens
                const issuer = await listen();
                issuer.use(() =>
                    Response.json({
                        issuer: issuer.url,
                        jwks_uri: 'http://127.0.0.1:1/jwks',
                        token_endpoint: `${issuer.url}/token`,
                    })
                );
                try {
                    serveWith(issuer.url);
                    const token = await serviceToken(authorization, url, 'notes:read');

                    const response = await post(`${served.url}/mcp`, {
                        authorization: `Bearer ${token}`,
                    });

                    expect(response.status).to.equal(500);
                    expect(errors[0]).to.be.instanceOf(TypeError);
                } finally {
                    await issuer.close();
                }
            }
        );
    });
});
