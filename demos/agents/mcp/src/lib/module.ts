import type { Hono } from 'hono';
import type { Binding } from 'haywire';
import type { McpAppConfig } from './app.js';
import type { ClientCredentialsOptions } from './credentials.js';
import type { JwtVerifierOptions } from './verifier.js';
import { NotesClient } from '@leyman/demo-openapi-client';
import { bind, createContainer, createModule } from 'haywire';
import { createMcpApp } from './app.js';
import { clientCredentials } from './credentials.js';
import { requestTimeoutMs } from './discovery.js';
import { mcpAppId, mcpConfigId, notesClientId, tokenVerifierId } from './ids.js';
import { jwtVerifier } from './verifier.js';

/**
 * Verifies agents' JWT access tokens.
 *
 * @param options - The issuer, and this server's audience
 * @returns A binding for `tokenVerifierId`
 */
export const jwtVerifierBinding = (
    options: JwtVerifierOptions
): Binding<typeof tokenVerifierId, [], false> =>
    bind(tokenVerifierId).withInstance(jwtVerifier(options));

export interface NotesApiOptions extends ClientCredentialsOptions {
    /**
     * Where the notes API is served.
     */
    readonly baseUrl: string;
}

/**
 * The notes API, called with the server's own token from the client credentials grant.
 *
 * @param options - Where the API is, and the server's credentials for it
 * @returns A binding for `notesClientId`
 */
export const notesApiBinding = (
    options: NotesApiOptions
): Binding<typeof notesClientId, [], false> =>
    bind(notesClientId).withInstance(
        new NotesClient({
            baseUrl: options.baseUrl,
            token: clientCredentials(options),
            // An API that never answers fails the tool call, rather than holding it forever
            fetch: async (input, init) =>
                fetch(input, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) }),
        })
    );

const mcpAppBinding = bind(mcpAppId)
    .withDependencies([notesClientId, tokenVerifierId, mcpConfigId])
    .withProvider(createMcpApp);

/**
 * The app. Bind `notesClientId`, `tokenVerifierId` and `mcpConfigId` to complete it.
 */
export const mcpModule = createModule(mcpAppBinding);

export interface NotesMcpOptions extends McpAppConfig {
    /**
     * The notes API, and the server's credentials for it. Its issuer may differ from agents'.
     */
    readonly api: NotesApiOptions;
}

/**
 * Creates the app from plain options: agents' tokens verified as JWTs from `issuer`, for `resourceUrl`. Compose
 * `mcpModule` directly to swap in another verifier or API client.
 *
 * @param options - Where it is served, who issues its tokens, the API, and error reporting
 * @returns Hono app, e.g. for `@hono/node-server`'s `serve`
 */
export const createNotesMcpApp = (options: NotesMcpOptions): Hono => {
    const { api, ...config } = options;
    return createContainer(
        mcpModule
            .addBinding(notesApiBinding(api))
            .addBinding(jwtVerifierBinding({ issuer: config.issuer, audience: config.resourceUrl }))
            .addBinding(bind(mcpConfigId).withInstance(config))
    ).get(mcpAppId);
};
