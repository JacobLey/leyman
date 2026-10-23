import type { OAuthTokenVerifier } from '@modelcontextprotocol/server';
import type { NotesClient } from '@leyman/demo-openapi-client';
import {
    createMcpHandler,
    getOAuthProtectedResourceMetadataUrl,
    hostHeaderValidationResponse,
    McpServer,
    OAuthError,
    originValidationResponse,
    requireBearerAuth,
} from '@modelcontextprotocol/server';
import { Hono } from 'hono';
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
 * Larger than any request a tool takes: `add_note`'s largest note (10,200 characters, at most 12 bytes each as JSON)
 * in a JSON-RPC envelope: 128 KiB. A larger body is a `413` before it's parsed.
 */
const maxBodyBytes = 131_072;

const statusUnauthorized = 401;

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
    const app = new Hono();
    const allowed = [...config.allowedHosts];
    // Against DNS rebinding: a request for another host, or from a page on another origin, is refused first
    app.use(
        async (context, next) =>
            hostHeaderValidationResponse(context.req.raw, allowed) ??
            originValidationResponse(context.req.raw, allowed) ??
            next()
    );

    const metadataPath = new URL(metadataUrl);
    app.get(metadataPath.pathname, context => {
        // Public metadata: a client running in a browser may read it too
        context.header('access-control-allow-origin', '*');
        return context.json({
            resource: config.resourceUrl,
            authorization_servers: [config.issuer],
            scopes_supported: connectScopes,
            bearer_methods_supported: ['header'],
            resource_name: 'Notes',
        });
    });

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
        { onerror: config.onError, maxRequestBodySize: maxBodyBytes }
    );
    app.all(resource.pathname, async context => {
        // Without a token, a challenge with no error code (RFC 6750): there's nothing wrong with a token not sent
        if (!context.req.header('authorization')) {
            return context.body(null, statusUnauthorized, {
                'www-authenticate': `Bearer resource_metadata="${metadataUrl}", scope="${connectScopes.join(' ')}"`,
            });
        }
        // Authentication comes before the body is read, so a caller without a token costs nothing to refuse
        const authInfo = await authenticate(context.req.raw);
        return authInfo instanceof Response
            ? authInfo
            : handler.fetch(context.req.raw, { authInfo });
    });
    return app;
};
