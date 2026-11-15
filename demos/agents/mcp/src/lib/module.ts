import type { Hono } from 'hono';
import type { Binding } from 'haywire';
import type { McpAppConfig } from './app.js';
import type { TokenExchangeOptions } from './exchange.js';
import type { JwtVerifierOptions } from './verifier.js';
import PQueue from 'p-queue';
import { bearer, compose } from '@leyman/demo-fetch-middleware';
import { NotesClient } from '@leyman/demo-openapi-client';
import { bind, createContainer, createModule } from 'haywire';
import { createMcpApp } from './app.js';
import { tokenExchange } from './exchange.js';
import { mcpAppId, mcpConfigId, notesApiId, tokenVerifierId } from './ids.js';
import { apiRequestTimeoutMs, notesApiSend } from './send.js';
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
    /**
     * How many requests to the API may be in flight at once, for all agents together. The rest wait their turn, so
     * a burst of agents can't flood the API. Each attempt counts (a request waiting out a retry's delay holds no
     * slot), and the wait for a slot doesn't count against the attempt's 15-second timeout, so a burst queues
     * rather than timing out and coming back as retries. Unset, there's no cap.
     */
    readonly maxConcurrentRequests?: number | undefined;
}

/**
 * The notes API, as each agent's user: called with a token exchanged for the agent's (RFC 8693), exchanged again
 * once when the API refuses it. Each attempt times out 15 seconds after it's sent (not counting a wait for a slot
 * under `maxConcurrentRequests`), and a request safe to send twice (a `GET`, or `add_note`'s `POST` with its
 * `Idempotency-Key`) is sent up to twice more when its answer may have been lost (a timeout, a dropped connection),
 * the API is still running an earlier attempt (`409`), it's busy (`429`, `503`) or a gateway failed (`502`, `504`).
 *
 * @param options - Where the API is, the server's credentials to exchange tokens with, and the concurrency cap
 * @returns A binding for `notesApiId`
 */
export const notesApiBinding = (
    options: NotesApiOptions
): Binding<typeof notesApiId, [], false> => {
    const exchange = tokenExchange(options);
    // One queue for the whole server, so the cap holds across every agent's client
    const send = notesApiSend({
        queue:
            options.maxConcurrentRequests === undefined
                ? undefined
                : new PQueue({ concurrency: options.maxConcurrentRequests }),
        timeoutMs: apiRequestTimeoutMs,
    });
    return bind(notesApiId).withInstance(agentToken => {
        const auth = bearer(exchange(agentToken));
        return new NotesClient({
            baseUrl: options.baseUrl,
            fetch: compose([auth], send),
        });
    });
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
