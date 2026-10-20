import type { Hono } from 'hono';
import type { NotesAppConfig } from './app.js';
import type { NotesDatabase } from './handlers.js';
import type { Authenticator, NotesHandlers } from './types.js';
import { identifier } from 'haywire';

/**
 * Bound by the app: Drizzle on a connection pool it owns. The server never closes it.
 */
export const databaseId = identifier<NotesDatabase>().named('notesDatabase');

/**
 * Which bearer tokens may call the secured operations.
 */
export const authenticatorId = identifier<Authenticator>();

/**
 * What each operation does.
 */
export const handlersId = identifier<NotesHandlers>();

/**
 * Bound by the app: error reporting.
 */
export const appConfigId = identifier<NotesAppConfig>();

/**
 * The Hono app, assembled from the features above.
 */
export const notesAppId = identifier<Hono>().named('notesApp');
