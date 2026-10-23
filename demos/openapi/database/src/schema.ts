import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * One row per note, each its owner's alone. The database makes the id and the time, so the defaults are in the
 * schema (and every test database) rather than in the app.
 */
export const notes = pgTable(
    'notes',
    {
        // Ordered by time (Postgres 18), so notes created at the same moment still list in the order they were made
        id: uuid().primaryKey().default(sql`uuidv7()`),
        // Who made it: the `sub` of their token, as the authorization server knows them
        owner: text().notNull(),
        title: text().notNull(),
        body: text().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    // `listNotes` reads one owner's, newest first
    table => [
        index('notes_owner_created_at_id').on(table.owner, table.createdAt.desc(), table.id.desc()),
    ]
);
