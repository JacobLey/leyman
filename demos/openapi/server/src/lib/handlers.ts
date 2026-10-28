/* eslint-disable @typescript-eslint/no-magic-numbers -- HTTP status codes, as the spec documents them */
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Note } from '@leyman/demo-openapi-spec/notes.openapi.yaml';
import type { NotesHandlers } from './types.js';
import { and, desc, eq, ilike } from 'drizzle-orm';
import { notes } from '@leyman/demo-openapi-database';

export type NotesDatabase = NodePgDatabase;

/**
 * Converts a row to the API's shape.
 *
 * @param row - A row of `notes`
 * @returns It, as the API's `Note`
 */
const toNote = (row: typeof notes.$inferSelect): Note => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
});

/**
 * A `LIKE` pattern matching `text` anywhere. `%`, `_` and a backslash in it match themselves, escaped with Postgres's
 * default escape character.
 *
 * @param text - What to find
 * @returns The pattern
 */
const containing = (text: string): string => {
    const escaped = text.replaceAll(/[%\\_]/gv, String.raw`\$&`);
    return `%${escaped}%`;
};

/**
 * The operations, on Postgres with Drizzle. Each gets a request that already matched the spec, so none checks its
 * input again. Each sees only the caller's notes: another's is as missing as one that doesn't exist, so an id says
 * nothing about whose it is.
 *
 * @param db - Drizzle, on the app's own connection pool
 * @returns A handler for every operation
 */
export const drizzleHandlers = (db: NotesDatabase): NotesHandlers => ({
    listNotes: async ({ query }, { subject }) => {
        const matching =
            query.q === undefined ? undefined : ilike(notes.title, containing(query.q));
        const rows = await db
            .select()
            .from(notes)
            .where(and(eq(notes.owner, subject), matching))
            .orderBy(desc(notes.createdAt), desc(notes.id))
            // The spec's default, filled in by validation
            .limit(query.limit);
        return { status: 200, body: { items: rows.map(row => toNote(row)) } };
    },
    createNote: async ({ body }, { subject }) => {
        const [row] = await db
            .insert(notes)
            .values({ owner: subject, title: body.title, body: body.body })
            .returning();
        return { status: 201, body: toNote(row!) };
    },
    getNote: async ({ path }, { subject }) => {
        const [row] = await db
            .select()
            .from(notes)
            .where(and(eq(notes.id, path.noteId), eq(notes.owner, subject)));
        return row
            ? { status: 200, body: toNote(row) }
            : { status: 404, body: { code: 'not_found', message: `No note ${path.noteId}` } };
    },
});
