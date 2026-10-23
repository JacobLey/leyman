import type { Hono } from 'hono';
import type { Binding } from 'haywire';
import type { McpAppConfig } from './app.js';
import type { TokenExchangeOptions } from './exchange.js';
import type { JwtVerifierOptions } from './verifier.js';
import { NotesClient } from '@leyman/demo-openapi-client';
import { bind, createContainer, createModule } from 'haywire';
import { createMcpApp } from './app.js';
import { requestTimeoutMs } from './discovery.js';
import { tokenExchange } from './exchange.js';
import { mcpAppId, mcpConfigId, notesApiId, tokenVerifierId } from './ids.js';
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

export interface NotesApiOptions extends TokenExchangeOptions {
    /**
     * Where the notes API is served.
     */
    readonly baseUrl: string;
}

/**
 * The notes API, as each agent's user: called with a token exchanged for the agent's (RFC 8693).
 *
 * @param options - Where the API is, and the server's credentials to exchange tokens with
 * @returns A binding for `notesApiId`
 */
export const notesApiBinding = (
    options: NotesApiOptions
): Binding<typeof notesApiId, [], false> => {
    const exchange = tokenExchange(options);
    return bind(notesApiId).withInstance(
        agentToken =>
            new NotesClient({
                baseUrl: options.baseUrl,
                token: async () => exchange(agentToken),
                // An API that never answers fails the tool call, rather than holding it forever
                fetch: async (input, init) =>
                    fetch(input, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) }),
            })
    );
};

const mcpAppBinding = bind(mcpAppId)
    .withDependencies([notesApiId, tokenVerifierId, mcpConfigId])
    .withProvider(createMcpApp);

/**
 * The app. Bind `notesApiId`, `tokenVerifierId` and `mcpConfigId` to complete it.
 */
export const mcpModule = createModule(mcpAppBinding);

export interface NotesMcpOptions extends McpAppConfig {
    /**
     * The notes API, and the server's credentials to exchange agents' tokens for its. Its issuer is agents' too:
     * only it can exchange the tokens it issued.
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
