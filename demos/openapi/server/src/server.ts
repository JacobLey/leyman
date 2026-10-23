export { notes } from '@leyman/demo-openapi-database';
export type { ApiError, NewNote, Note, NoteList, Operations, Paths } from './generated/api.js';
export { createApp, type NotesAppConfig, type ProtectedResource } from './lib/app.js';
export { type StaticToken, staticTokens } from './lib/auth.js';
export {
    NotesAuthorizationServerError,
    NotesResponseError,
    NotesServerError,
} from './lib/errors.js';
export { drizzleHandlers, type NotesDatabase } from './lib/handlers.js';
export { type JwtAuthenticatorOptions, jwtAuthenticator } from './lib/jwt.js';
export { appConfigId, authenticatorId, databaseId, handlersId, notesAppId } from './lib/ids.js';
export {
    createNotesApp,
    drizzleHandlersBinding,
    jwtAuthenticatorBinding,
    type NotesAppOptions,
    notesModule,
    staticTokensBinding,
} from './lib/module.js';
export type {
    Authentication,
    Authenticator,
    Caller,
    NotesHandlers,
    OperationId,
    OperationInput,
    OperationResult,
} from './lib/types.js';
