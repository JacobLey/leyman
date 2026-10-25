import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { auth } from '@modelcontextprotocol/client';
import { decodeJwt } from 'jose';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { listenDevAuthorizationServer } from 'oauth-dev-server';
import { DevOAuthClientProvider } from 'oauth-dev-server/mcp';

const clientId = 'test-agent';
const redirectUri = 'http://127.0.0.1:1/callback';

/**
 * Finishes the SDK's authorization with the redirect the provider kept, as a client's host does when the user comes
 * back from the browser.
 *
 * @param provider - Holding the redirect
 * @param serverUrl - The MCP server's
 * @returns The SDK's result
 */
const finish = async (provider: DevOAuthClientProvider, serverUrl: string): Promise<string> => {
    const callback = provider.takeCallback()!;
    return auth(provider, {
        serverUrl,
        authorizationCode: callback.get('code')!,
        iss: callback.get('iss')!,
    });
};

suite('DevOAuthClientProvider', () => {
    /**
     * A dev authorization server, and an MCP server's Protected Resource Metadata (RFC 9728) pointing to it: all the
     * SDK's authorization needs of a server.
     */
    const withServers = beforeEach(async () => {
        let issuer = '';
        const mcp = createServer((request, response) => {
            response.writeHead(200, { 'content-type': 'application/json' }).end(
                JSON.stringify({
                    resource: `http://${request.headers.host!}/mcp`,
                    authorization_servers: [issuer],
                    scopes_supported: ['notes:read', 'notes:write'],
                })
            );
        });
        mcp.listen(0, '127.0.0.1');
        await once(mcp, 'listening');
        const serverUrl = `http://127.0.0.1:${(mcp.address() as AddressInfo).port}/mcp`;
        const authorization = await listenDevAuthorizationServer({
            resources: [{ url: serverUrl, scopes: ['notes:read', 'notes:write'] }],
            clients: [{ clientId, redirectUris: ['http://127.0.0.1/callback'] }],
            services: [],
            accountId: 'dev-user',
        });
        ({ issuer } = authorization);
        return { authorization, mcp, serverUrl };
    });
    withServers.afterEach(async ({ authorization, mcp }) => {
        await authorization.close();
        mcp.close();
        mcp.closeAllConnections();
    });

    withServers.test("Signs in through the SDK's flow", async ({ serverUrl }) => {
        const provider = new DevOAuthClientProvider({ clientId, redirectUri });

        const started = await auth(provider, { serverUrl, scope: 'notes:read' });
        const finished = await finish(provider, serverUrl);

        expect([started, finished]).to.deep.equal(['REDIRECT', 'AUTHORIZED']);
        expect(provider.authorizations).to.have.length(1);
        expect(provider.authorizations[0]?.searchParams.get('resource')).to.equal(serverUrl);
        expect(decodeJwt(provider.tokens()!.access_token)).to.include({
            sub: 'dev-user',
            aud: serverUrl,
            client_id: clientId,
            scope: 'notes:read',
        });
        expect(provider.tokens()?.refresh_token).to.be.a('string');
        expect(provider.takeCallback()).to.equal(null);
    });

    withServers.test('Signs in as the user asked for', async ({ serverUrl }) => {
        const provider = new DevOAuthClientProvider({ clientId, redirectUri, user: 'alice' });

        await auth(provider, { serverUrl, scope: 'notes:read' });
        await finish(provider, serverUrl);

        expect(decodeJwt(provider.tokens()!.access_token).sub).to.equal('alice');
    });

    withServers.test(
        'Steps up to more scopes in the same session, as the same user',
        async ({ serverUrl }) => {
            const cookies = new Map<string, string>();
            const provider = new DevOAuthClientProvider({
                clientId,
                redirectUri,
                cookies,
                user: 'alice',
            });
            await auth(provider, { serverUrl, scope: 'notes:read' });
            await finish(provider, serverUrl);

            const steppedUp = await auth(provider, {
                serverUrl,
                scope: 'notes:read notes:write',
                forceReauthorization: true,
            });
            await finish(provider, serverUrl);

            expect(steppedUp).to.equal('REDIRECT');
            expect(provider.authorizations).to.have.length(2);
            expect(cookies.size).to.be.greaterThan(0);
            expect(decodeJwt(provider.tokens()!.access_token)).to.include({
                sub: 'alice',
                scope: 'notes:read notes:write',
            });
        }
    );
});
