import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { listenDevAuthorizationServer } from '@leyman/demo-oauth-server';
import { createNotesApp, jwtAuthenticator } from '@leyman/demo-openapi-server';
import { withDatabase } from './database.js';
import { listen } from './serve.js';

/**
 * Everything the CLI talks to, for each test of the suite it's called in: a dev authorization server (where the CLI
 * is registered as `notes-cli`, allowed device logins), and the notes API on a database of its own, saying who issues its tokens. And a
 * directory for the CLI's login.
 *
 * @returns Fixture, with the API's `api` URL and the CLI's `configDir`
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- mocha-chain's fixture type is inferred
export const withStack = () => {
    const withServers = withDatabase().beforeEach(async ({ database }) => {
        const served = await listen();
        const api = served.url;
        const authorization = await listenDevAuthorizationServer({
            resources: [{ url: api, scopes: ['notes:read', 'notes:write'] }],
            clients: [
                {
                    clientId: 'notes-cli',
                    redirectUris: ['http://127.0.0.1/callback'],
                    deviceAuthorization: true,
                },
                {
                    clientId: 'no-refresh',
                    redirectUris: ['http://127.0.0.1/callback'],
                    refreshTokens: false,
                },
            ],
            services: [],
            accountId: 'dev-user',
            // Device logins poll every second, not five
            deviceInterval: 1,
        });
        const pool = new Pool({ connectionString: database.url, max: 2 });
        const db = drizzle({ client: pool });
        const errors: Error[] = [];
        served.use(
            createNotesApp({
                db,
                authenticate: jwtAuthenticator({ issuer: authorization.issuer, audience: api }),
                protectedResource: { resource: api, authorizationServers: [authorization.issuer] },
                onError: error => {
                    errors.push(error);
                },
            }).fetch
        );
        const configDir = await mkdtemp(Path.join(tmpdir(), 'notes-cli-'));
        return { api, authorization, configDir, db, errors, pool, served };
    });
    withServers.afterEach(async ({ authorization, configDir, pool, served }) => {
        await served.close();
        await authorization.close();
        await pool.end();
        await rm(configDir, { recursive: true, force: true });
    });
    return withServers;
};
