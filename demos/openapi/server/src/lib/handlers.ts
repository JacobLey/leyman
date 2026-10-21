/* eslint-disable @typescript-eslint/no-magic-numbers -- HTTP status codes, as the spec documents them */
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Note } from '../generated/api.js';
import type { NotesHandlers } from './types.js';
import { desc, eq } from 'drizzle-orm';
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
 * The operations, on Postgres with Drizzle. Each gets a request that already matched the spec, so none checks its
 * input again.
 *
 * @param db - Drizzle, on the app's own connection pool
 * @returns A handler for every operation
 */
export const drizzleHandlers = (db: NotesDatabase): NotesHandlers => ({
    listNotes: async ({ query }) => {
        const rows = await db
            .select()
            .from(notes)
            .orderBy(desc(notes.createdAt), desc(notes.id))
            // The spec's default, filled in by validation
            .limit(query.limit);
        return { status: 200, body: { items: rows.map(row => toNote(row)) } };
    },
    createNote: async ({ body }) => {
        const [row] = await db
            .insert(notes)
            .values({ title: body.title, body: body.body })
            .returning();
        return { status: 201, body: toNote(row!) };
    },
    getNote: async ({ path }) => {
        const [row] = await db.select().from(notes).where(eq(notes.id, path.noteId));
        return row
            ? { status: 200, body: toNote(row) }
            : { status: 404, body: { code: 'not_found', message: `No note ${path.noteId}` } };
    },
});
