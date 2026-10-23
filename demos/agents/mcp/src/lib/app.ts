import type { OAuthTokenVerifier } from '@modelcontextprotocol/server';
import type { Hono } from 'hono';
import type { NotesClient } from '@leyman/demo-openapi-client';
import { createMcpHonoApp } from '@modelcontextprotocol/hono';
import {
    createMcpHandler,
    getOAuthProtectedResourceMetadataUrl,
    McpServer,
    OAuthError,
    requireBearerAuth,
} from '@modelcontextprotocol/server';
import { registerNoteTools } from './tools.js';

export interface McpAppConfig {
    /**
     * The server's canonical URI, where it is served (e.g. `https://notes.example/mcp`): agents' tokens must be
     * issued for it.
     */
    readonly resourceUrl: string;
    /**
     * The authorization server agents get tokens from, advertised in the server's metadata.
     */
    readonly issuer: string;
    /**
     * `Host` (and `Origin`) hostnames the server answers to, against DNS rebinding.
     */
    readonly allowedHosts: readonly string[];
    /**
     * Called with every failure an agent is only told about in general.
     */
    readonly onError: (error: Error) => void;
}

/**
 * The scopes a token needs to connect at all: the least that's useful. Tools that need more ask for it.
 */
const connectScopes = ['notes:read'];

/**
 * The notes MCP server, as a Hono app: an OAuth resource server (RFC 9728 metadata, `WWW-Authenticate` challenges,
 * audience-checked tokens), serving the 2026-07-28 protocol statelessly, with a fresh `McpServer` per request.
 *
 * @param notes - The notes API, with the server's own credentials
 * @param verifier - Verifies agents' access tokens
 * @param config - Where it is served, who issues its tokens, and error reporting
 * @returns Hono app, e.g. for `@hono/node-server`'s `serve`
 */
export const createMcpApp = (
    notes: NotesClient,
    verifier: OAuthTokenVerifier,
    config: McpAppConfig
): Hono => {
    const resource = new URL(config.resourceUrl);
    const metadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
    const app = createMcpHonoApp({
        allowedHosts: [...config.allowedHosts],
        allowedOrigins: [...config.allowedHosts],
    });

    const metadataPath = new URL(metadataUrl);
    app.get(metadataPath.pathname, context =>
        context.json({
            resource: config.resourceUrl,
            authorization_servers: [config.issuer],
            scopes_supported: connectScopes,
            bearer_methods_supported: ['header'],
            resource_name: 'Notes',
        })
    );

    const authenticate = requireBearerAuth({
        verifier: {
            // A verifier that fails for another reason than the token (e.g. its issuer is down) is a 500, which the
            // SDK answers without saying why: it's reported here instead
            verifyAccessToken: async token => {
                try {
                    return await verifier.verifyAccessToken(token);
                } catch (error) {
                    if (!(error instanceof OAuthError)) {
                        config.onError(error as Error);
                    }
                    throw error;
                }
            },
        },
        requiredScopes: connectScopes,
        resourceMetadataUrl: metadataUrl,
        expectedResource: resource,
    });
    const handler = createMcpHandler(
        () => {
            const server = new McpServer({ name: 'notes', version: '1.0.0' });
            registerNoteTools(server, notes, config.onError);
            return server;
        },
        { onerror: config.onError }
    );
    app.all(resource.pathname, async context => {
        const authInfo = await authenticate(context.req.raw);
        if (authInfo instanceof Response) {
            return authInfo;
        }
        return handler.fetch(context.req.raw, {
            authInfo,
            // The body, as `createMcpHonoApp`'s middleware already read it. Its app doesn't type the variable.
            parsedBody: context.get('parsedBody' as never),
        });
    });
    return app;
};
