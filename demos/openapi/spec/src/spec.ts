/* eslint-disable @typescript-eslint/no-magic-numbers -- Status codes and limits are the document's data */
import { arraySchema, numberSchema, objectSchema, serializeSpec, stringSchema } from 'juniper';

const idSchema = stringSchema({ format: 'uuid' });

export const noteSchema = objectSchema({
    properties: {
        id: idSchema,
        title: stringSchema({ minLength: 1, maxLength: 200 }),
        body: stringSchema({ maxLength: 10_000 }),
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
    404: { description: 'No such note', content: json(errorSchema) },
} as const;

/**
 * The notes API: deliberately small, so the plumbing around it is the point. Reads are public, and writes need a
 * bearer token.
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
                summary: 'The newest notes',
                parameters: [
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
                },
            },
            post: {
                operationId: 'createNote',
                summary: 'Add a note',
                security: [{ bearer: [] }],
                requestBody: { required: true, content: json(newNoteSchema) },
                responses: {
                    201: { description: 'The note added', content: json(noteSchema) },
                    400: errors[400],
                    401: errors[401],
                },
            },
        },
        '/notes/{noteId}': {
            parameters: [{ name: 'noteId', in: 'path', required: true, schema: idSchema }],
            get: {
                operationId: 'getNote',
                summary: 'One note',
                responses: {
                    200: { description: 'The note', content: json(noteSchema) },
                    400: errors[400],
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
