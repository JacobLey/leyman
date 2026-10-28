export type {
    ApiError,
    NewNote,
    Note,
    NoteList,
    Operations,
    Paths,
} from '@leyman/demo-openapi-spec/notes.openapi.yaml';
export { NotesClient, type NotesClientOptions } from './lib/client.js';
export { NotesClientError, NotesClientUnexpectedStatusError } from './lib/errors.js';
export type { OperationId, OperationInput, OperationResult } from './lib/types.js';
