import type { Hono } from 'hono';
import type { Binding } from 'haywire';
import type { NotesAppConfig } from './app.js';
import type { NotesDatabase } from './handlers.js';
import type { JwtAuthenticatorOptions } from './jwt.js';
import type { Authenticator } from './types.js';
import { bind, createContainer, createModule } from 'haywire';
import { createApp } from './app.js';
import { staticTokens } from './auth.js';
import { drizzleHandlers } from './handlers.js';
import { appConfigId, authenticatorId, databaseId, handlersId, notesAppId } from './ids.js';
import { jwtAuthenticator } from './jwt.js';

/**
 * Handlers on Postgres, with Drizzle.
 */
export const drizzleHandlersBinding = bind(handlersId)
    .withDependencies([databaseId])
    .withProvider(db => drizzleHandlers(db));

/**
 * Accepts these bearer tokens.
 *
 * @param tokens - Every token allowed
 * @returns A binding for `authenticatorId`
 */
export const staticTokensBinding = (
    tokens: readonly string[]
): Binding<typeof authenticatorId, [], false> =>
    bind(authenticatorId).withInstance(staticTokens(tokens));

/**
 * Accepts JWT access tokens from an authorization server.
 *
 * @param options - The issuer, and this API's audience
 * @returns A binding for `authenticatorId`
 */
export const jwtAuthenticatorBinding = (
    options: JwtAuthenticatorOptions
): Binding<typeof authenticatorId, [], false> =>
    bind(authenticatorId).withInstance(jwtAuthenticator(options));

const notesAppBinding = bind(notesAppId)
    .withDependencies([handlersId, authenticatorId, appConfigId])
    .withProvider(createApp);

/**
 * The app, with Drizzle handlers. Bind `databaseId`, `authenticatorId` and `appConfigId` to complete it.
 */
export const notesModule = createModule(notesAppBinding).addBinding(drizzleHandlersBinding);

export interface NotesAppOptions extends NotesAppConfig {
    /**
     * Drizzle, on a connection pool the app owns. Never closed by the server.
     */
    readonly db: NotesDatabase;
    /**
     * Checks bearer tokens: `staticTokens(...)` or `jwtAuthenticator(...)`.
     */
    readonly authenticate: Authenticator;
}

/**
 * Creates the app from plain options. Compose `notesModule` directly to swap in other handlers or authentication.
 *
 * @param options - Database, authentication, and error reporting
 * @returns Hono app, e.g. for `@hono/node-server`'s `serve`
 */
export const createNotesApp = (options: NotesAppOptions): Hono =>
    createContainer(
        notesModule
            .addBinding(bind(databaseId).withInstance(options.db))
            .addBinding(bind(authenticatorId).withInstance(options.authenticate))
            .addBinding(
                bind(appConfigId).withInstance({
                    onError: options.onError,
                    protectedResource: options.protectedResource,
                })
            )
    ).get(notesAppId);
