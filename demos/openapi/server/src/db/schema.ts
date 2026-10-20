import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * One row per note. The database makes the id and the time, so the defaults are in the schema (and every test
 * database) rather than in the app.
 */
export const notes = pgTable(
    'notes',
    {
        id: uuid().primaryKey().defaultRandom(),
        title: text().notNull(),
        body: text().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    // `listNotes` reads the newest first
    table => [index('notes_created_at_id').on(table.createdAt.desc(), table.id.desc())]
);
