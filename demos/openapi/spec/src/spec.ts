/* eslint-disable @typescript-eslint/no-magic-numbers -- Status codes and limits are the document's data */
import { arraySchema, numberSchema, objectSchema, serializeSpec, stringSchema } from 'juniper';

const idSchema = stringSchema({ format: 'uuid' });

/**
 * Text is stored in Postgres, which can't store a NUL character: a request with one must be a 400, not a failed
 * insert.
 */
const withoutNul = String.raw`^[^\u0000]*$`;

const titleSchema = stringSchema({ minLength: 1, maxLength: 200, pattern: withoutNul });

export const noteSchema = objectSchema({
    properties: {
        id: idSchema,
        title: titleSchema,
        body: stringSchema({ maxLength: 10_000, pattern: withoutNul }),
        createdAt: stringSchema({ format: 'date-time' }),
    },
    required: ['id', 'title', 'body', 'createdAt'],
    additionalProperties: false,
}).define('Note');

export const newNoteSchema = noteSchema.pick(['title', 'body']).define('NewNote');

export const noteListSchema = objectSchema({
    properties: { items: arraySchema(noteSchema) },
    required: ['items'],
    additionalProperties: false,
}).define('NoteList');

export const errorSchema = objectSchema({
    properties: {
        code: stringSchema(),
        message: stringSchema(),
    },
    required: ['code', 'message'],
    additionalProperties: false,
}).define('ApiError');

const json = <const S>(schema: S) => ({ 'application/json': { schema } }) as const;

const errors = {
    400: { description: 'The request does not match the spec', content: json(errorSchema) },
    401: { description: 'Missing or invalid bearer token', content: json(errorSchema) },
    403: {
        description: 'The token lacks the scope the operation needs',
        content: json(errorSchema),
    },
    404: { description: 'No such note', content: json(errorSchema) },
    413: { description: 'The body is larger than any valid request', content: json(errorSchema) },
} as const;

/**
 * Every operation needs a bearer token with its scope: `notes:read` to read, `notes:write` to write. OpenAPI 3.1
 * allows a list of scopes (role names) for an `http` scheme too, not only for OAuth's.
 *
 * @param scope - The scope the operation needs
 * @returns The operation's `security`
 */
const needs = (scope: 'notes:read' | 'notes:write'): { bearer: string[] }[] => [
    { bearer: [scope] },
];

const secured = { 401: errors[401], 403: errors[403] } as const;

/**
 * The notes API: deliberately small, so the plumbing around it is the point. Every operation needs a bearer token
 * with its scope.
 *
 * Plain data with Juniper schemas in place. `serializeSpec` turns each into JSON Schema 2020-12 (OpenAPI 3.1), and
 * collects every defined schema into `components.schemas`, so no `$ref` is left dangling.
 */
export const spec = serializeSpec({
    openapi: '3.1.0',
    info: {
        title: 'Notes API',
        version: '1.0.0',
        description:
            'The OpenAPI demo: a document built with Juniper, a typed client and a validating server.',
    },
    paths: {
        '/notes': {
            get: {
                operationId: 'listNotes',
                summary: 'The newest notes, optionally only those whose title contains some text',
                security: needs('notes:read'),
                parameters: [
                    {
                        name: 'q',
                        in: 'query',
                        description: 'Only notes whose title contains this, ignoring case',
                        schema: titleSchema,
                    },
                    {
                        name: 'limit',
                        in: 'query',
                        schema: numberSchema({
                            type: 'integer',
                            minimum: 1,
                            maximum: 100,
                            default: 20,
                        }),
                    },
                ],
                responses: {
                    200: { description: 'Notes, newest first', content: json(noteListSchema) },
                    400: errors[400],
                    ...secured,
                },
            },
            post: {
                operationId: 'createNote',
                summary: 'Add a note',
                security: needs('notes:write'),
                requestBody: { required: true, content: json(newNoteSchema) },
                responses: {
                    201: { description: 'The note added', content: json(noteSchema) },
                    400: errors[400],
                    ...secured,
                    413: errors[413],
                },
            },
        },
        '/notes/{noteId}': {
            parameters: [{ name: 'noteId', in: 'path', required: true, schema: idSchema }],
            get: {
                operationId: 'getNote',
                summary: 'One note',
                security: needs('notes:read'),
                responses: {
                    200: { description: 'The note', content: json(noteSchema) },
                    400: errors[400],
                    ...secured,
                    404: errors[404],
                },
            },
        },
    },
    components: {
        securitySchemes: {
            bearer: { type: 'http', scheme: 'bearer' },
        },
    },
});
