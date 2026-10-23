import type { OAuthTokenVerifier } from '@modelcontextprotocol/server';
import type { Hono } from 'hono';
import type { NotesClient } from '@leyman/demo-openapi-client';
import type { McpAppConfig } from './app.js';
import { identifier } from 'haywire';

/**
 * The notes API, with the server's own credentials.
 */
export const notesClientId = identifier<NotesClient>();

/**
 * Verifies agents' access tokens.
 */
export const tokenVerifierId = identifier<OAuthTokenVerifier>();

/**
 * Bound by the app: where the server is served, who issues its tokens, and error reporting.
 */
export const mcpConfigId = identifier<McpAppConfig>();

/**
 * The Hono app, assembled from the features above.
 */
export const mcpAppId = identifier<Hono>().named('mcpApp');
