import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { createNotesMcpApp } from '@leyman/demo-agents-mcp';
import { listenDevAuthorizationServer } from '@leyman/demo-oauth-server';
import { createNotesApp, jwtAuthenticator } from '@leyman/demo-openapi-server';
import { agentClientId, agentRedirectUri } from './agent.js';
import { withDatabase } from './database.js';
import { listen } from './serve.js';

/**
 * The notes API's resource identifier. Any URI will do: it names the API in tokens, and is never fetched.
 */
export const apiAudience = 'https://notes-api.test';

export const mcpService = {
    clientId: 'notes-mcp',
    clientSecret: 'notes-mcp-secret',
    scopes: ['notes:read', 'notes:write'],
};

/**
 * Who a login signs in as, unless it names another.
 */
export const defaultUser = 'dev-user';

export interface StackOptions {
    /**
     * The audience the API accepts tokens for. Another than the MCP server asks for makes the API refuse it.
     *
     * @default apiAudience
     */
    readonly apiAccepts?: string;
}

/**
 * Everything, as it would be deployed, for each test of the suite it's called in: a dev authorization server, the
 * notes API on a database of its own (accepting only that server's tokens), and the MCP server in front of it. Every
 * failure either server reports is collected.
 *
 * @param options - What to change
 * @returns Fixture, with the MCP server's `url`
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- mocha-chain's fixture type is inferred
export const withStack = (options: StackOptions = {}) => {
    const withServers = withDatabase().beforeEach(async ({ database }) => {
        const mcp = await listen();
        const url = `${mcp.url}/mcp`;
        const authorization = await listenDevAuthorizationServer({
            resources: [
                { url, scopes: ['notes:read', 'notes:write'] },
                { url: apiAudience, scopes: ['notes:read', 'notes:write'] },
            ],
            clients: [{ clientId: agentClientId, redirectUris: [agentRedirectUri] }],
            // The MCP server may exchange agents' tokens, issued for it, for the API's
            services: [{ ...mcpService, tokenExchange: { subjectAudience: url } }],
            accountId: defaultUser,
        });
        const pool = new Pool({ connectionString: database.url, max: 2 });
        const db = drizzle({ client: pool });
        const errors: Error[] = [];
        const onError = (error: Error): void => {
            errors.push(error);
        };
        const api = await listen();
        api.use(
            createNotesApp({
                authenticate: jwtAuthenticator({
                    issuer: authorization.issuer,
                    audience: options.apiAccepts ?? apiAudience,
                }),
                db,
                onError,
            }).fetch
        );
        mcp.use(
            createNotesMcpApp({
                resourceUrl: url,
                issuer: authorization.issuer,
                allowedHosts: ['127.0.0.1'],
                api: {
                    baseUrl: api.url,
                    issuer: authorization.issuer,
                    resource: apiAudience,
                    clientId: mcpService.clientId,
                    clientSecret: mcpService.clientSecret,
                },
                onError,
            }).fetch
        );
        return { origin: mcp.url, url, authorization, db, pool, api, mcp, errors };
    });
    withServers.afterEach(async ({ authorization, pool, api, mcp }) => {
        await mcp.close();
        await api.close();
        await authorization.close();
        await pool.end();
    });
    return withServers;
};
