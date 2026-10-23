import type { ListeningAuthorizationServer } from '@leyman/demo-oauth-server';
import { createHash, randomBytes } from 'node:crypto';
import { decodeJwt } from 'jose';
import sinon from 'sinon';
import { NotesMcpAuthorizationServerError, tokenExchange } from '@leyman/demo-agents-mcp';
import { followAuthorization, listenDevAuthorizationServer } from '@leyman/demo-oauth-server';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';

const mcpResource = 'https://notes-mcp.test';
const apiResource = 'https://notes-api.test';
const agent = { clientId: 'agent', redirectUri: 'http://127.0.0.1:9/callback' };
// Characters Basic authentication must encode (RFC 6749 §2.3.1)
const service = { clientId: 'service', clientSecret: 'p%s+s:w rd' };

/**
 * A user's access token for the MCP server, by the authorization code flow, as an agent gets one.
 *
 * @param server - Where to authorize
 * @param user - Who signs in
 * @returns An access token, issued for the MCP server
 */
const agentToken = async (server: ListeningAuthorizationServer, user: string): Promise<string> => {
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
        response_type: 'code',
        client_id: agent.clientId,
        redirect_uri: agent.redirectUri,
        resource: mcpResource,
        scope: 'notes:read',
        login_hint: user,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
    });
    const callback = await followAuthorization(
        new URL(`${server.issuer}/auth?${query}`),
        agent.redirectUri
    );
    const response = await fetch(`${server.issuer}/token`, {
        method: 'POST',
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: agent.clientId,
            redirect_uri: agent.redirectUri,
            resource: mcpResource,
            code: callback.searchParams.get('code')!,
            code_verifier: verifier,
        }),
    });
    const { access_token: token } = (await response.json()) as { readonly access_token: string };
    return token;
};

suite('tokenExchange', () => {
    /**
     * A dev authorization server where the service may exchange tokens for the MCP server, and a user's token for it.
     */
    const withServer = beforeEach(async () => {
        const server = await listenDevAuthorizationServer({
            resources: [
                { url: mcpResource, scopes: ['notes:read', 'notes:write'] },
                { url: apiResource, scopes: ['notes:read', 'notes:write'] },
            ],
            clients: [{ clientId: agent.clientId, redirectUris: ['http://127.0.0.1/callback'] }],
            services: [
                {
                    ...service,
                    scopes: ['notes:read', 'notes:write'],
                    tokenExchange: { subjectAudience: mcpResource },
                },
            ],
            accountId: 'dev-user',
        });
        return {
            server,
            alice: await agentToken(server, 'alice'),
            exchange: tokenExchange({ issuer: server.issuer, resource: apiResource, ...service }),
        };
    });
    withServer.afterEach(async ({ server }) => {
        await server.close();
    });

    withServer.test(
        "Gets a token for the API, as the agent's user, with the server acting",
        async ({ alice, exchange }) => {
            const token = await exchange(alice);

            expect(decodeJwt(token)).to.deep.include({
                aud: apiResource,
                sub: 'alice',
                act: { sub: service.clientId },
                scope: 'notes:read',
            });
        }
    );

    withServer.test(
        "Gets each user's own, and shares one per agent token",
        async ({ server, alice, exchange }) => {
            const bob = await agentToken(server, 'bob');

            const [first, second, forBob] = await Promise.all([
                exchange(alice),
                exchange(alice),
                exchange(bob),
            ]);

            expect(second).to.equal(first);
            expect(await exchange(alice)).to.equal(first);
            expect(decodeJwt(forBob).sub).to.equal('bob');
        }
    );

    withServer.test('Gets another once one nears expiry', async ({ server, alice, exchange }) => {
        const bob = await agentToken(server, 'bob');
        // Only the clock: requests still run in real time
        const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date'] });
        try {
            const first = await exchange(alice);

            // 40 seconds left (it never outlives the agent's token, so may be a second short of 600): the same token
            clock.tick(560_000);
            expect(await exchange(alice)).to.equal(first);

            // Within 30 seconds of expiry: another, and the expired one is dropped along the way
            clock.tick(15_000);
            await exchange(bob);
            expect(await exchange(alice)).to.not.equal(first);
        } finally {
            clock.restore();
        }
    });

    withServer.test(
        'Rejects, and tries again, when the exchange is refused',
        async ({ server, alice }) => {
            const exchange = tokenExchange({
                issuer: server.issuer,
                resource: apiResource,
                ...service,
                clientSecret: 'wrong',
            });

            await expect(exchange(alice)).to.be.rejectedWith(
                NotesMcpAuthorizationServerError,
                "refused to exchange the agent's token (401)"
            );
            await expect(exchange(alice)).to.be.rejectedWith(NotesMcpAuthorizationServerError);
        }
    );

    withServer.test('Rejects a token not issued for the server', async ({ exchange }) => {
        await expect(exchange('forged')).to.be.rejectedWith(
            NotesMcpAuthorizationServerError,
            "refused to exchange the agent's token (400)"
        );
    });

    withServer.test(
        'Rejects, and tries again, when there is no discovery document',
        async ({ server, alice }) => {
            const exchange = tokenExchange({
                issuer: `${server.issuer}/nowhere`,
                resource: apiResource,
                ...service,
            });

            await expect(exchange(alice)).to.be.rejectedWith(
                NotesMcpAuthorizationServerError,
                'discovery answered 404'
            );
            await expect(exchange(alice)).to.be.rejectedWith(
                NotesMcpAuthorizationServerError,
                'discovery answered 404'
            );
        }
    );

    withServer.test(
        'Rejects a discovery document for another issuer',
        async ({ server, alice }) => {
            // Found without the trailing slash, but naming the issuer without it
            const exchange = tokenExchange({
                issuer: `${server.issuer}/`,
                resource: apiResource,
                ...service,
            });

            await expect(exchange(alice)).to.be.rejectedWith(
                NotesMcpAuthorizationServerError,
                'named another issuer'
            );
        }
    );
});
