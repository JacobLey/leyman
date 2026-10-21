import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * One row per note. The database makes the id and the time, so the defaults are in the schema (and every test
 * database) rather than in the app.
 */
export const notes = pgTable(
    'notes',
    {
        // Ordered by time (Postgres 18), so notes created at the same moment still list in the order they were made
        id: uuid().primaryKey().default(sql`uuidv7()`),
        title: text().notNull(),
        body: text().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    // `listNotes` reads the newest first
    table => [index('notes_created_at_id').on(table.createdAt.desc(), table.id.desc())]
);
