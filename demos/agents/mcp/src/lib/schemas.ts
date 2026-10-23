import type { JsonSchemaType } from '@modelcontextprotocol/server';
import type { Note } from '@leyman/demo-openapi-client';
import { fromJsonSchema } from '@modelcontextprotocol/server';
import document from '@leyman/demo-openapi-spec/openapi.json' with { type: 'json' };

/**
 * Every constraint below is the API's own, read from its `openapi.json`: a tool never accepts what the API would
 * reject, and changing the API's limits changes the tools'.
 */
const { Note: noteSchema, NewNote: newNoteSchema } = document.components.schemas;
const listParameters = new Map(
    document.paths['/notes'].get.parameters.map(({ name, schema }) => [name, schema])
);
const [noteIdParameter] = document.paths['/notes/{noteId}'].parameters;

/**
 * How many notes `find_notes` lists unless asked: fewer than the API's default, as each costs the agent context.
 */
export const defaultFindLimit = 10;

export type NoteSummary = Pick<Note, 'createdAt' | 'id' | 'title'>;

/**
 * An object of some of the note's properties, as an output schema: only their types (and formats), not the API's
 * limits. Inputs carry every limit, so an agent knows what it may send. Outputs are only read, so their limits would
 * cost the agent context for nothing.
 *
 * @param keys - Which properties
 * @returns The object's schema
 */
const noteOutput = (keys: readonly (keyof Note)[]): JsonSchemaType => ({
    type: 'object',
    properties: Object.fromEntries(
        keys.map(key => {
            const property: { readonly type: string; readonly format?: string } =
                noteSchema.properties[key];
            return [
                key,
                { type: property.type, ...(property.format && { format: property.format }) },
            ];
        })
    ),
    required: [...keys],
    additionalProperties: false,
});

export const findNotesInput = fromJsonSchema<{ readonly q?: string; readonly limit?: number }>({
    type: 'object',
    properties: {
        q: {
            ...listParameters.get('q'),
            description: 'Only notes whose title contains this, ignoring case',
        },
        limit: {
            ...listParameters.get('limit'),
            default: defaultFindLimit,
            description: 'How many to list, newest first',
        },
    },
    additionalProperties: false,
});

export const findNotesOutput = fromJsonSchema<{ readonly notes: readonly NoteSummary[] }>({
    type: 'object',
    properties: { notes: { type: 'array', items: noteOutput(['id', 'title', 'createdAt']) } },
    required: ['notes'],
    additionalProperties: false,
});

export const readNoteInput = fromJsonSchema<{ readonly id: string }>({
    type: 'object',
    properties: { id: { ...noteIdParameter!.schema, description: 'From find_notes' } },
    required: ['id'],
    additionalProperties: false,
});

export const readNoteOutput = fromJsonSchema<Note>(
    noteOutput(['id', 'title', 'body', 'createdAt'])
);

export const newNoteInput = fromJsonSchema<{ readonly title: string; readonly body: string }>(
    newNoteSchema
);

export const newNoteOutput = fromJsonSchema<Pick<Note, 'createdAt' | 'id'>>(
    noteOutput(['id', 'createdAt'])
);
