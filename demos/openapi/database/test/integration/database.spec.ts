import type { Context } from 'mocha';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { notes } from '@leyman/demo-openapi-database';
import { expect } from '@leyman/expect';
import { before, suite } from 'mocha-chain';
import { PgDolly } from 'pg-dolly';

const schema = await readFile(
    new URL(import.meta.resolve('@leyman/demo-openapi-database/schema.sql')),
    'utf8'
);
const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url));

suite('Database', () => {
    const withDolly = before(async () => {
        const dolly = await PgDolly.connect();
        return { dolly, template: await dolly.template(schema) };
    });
    withDolly.after(async ({ dolly }) => {
        await dolly.close();
    });

    const withDb = withDolly.beforeEach(async ({ template }) => {
        const database = await template.clone();
        const pool = new Pool({ connectionString: database.url, max: 2 });
        return { database, pool, db: drizzle({ client: pool }) };
    });
    withDb.afterEach(async function (this: Context, { database, pool }) {
        await pool.end();
        if (this.currentTest?.state === 'failed') {
            database.keep();
        }
    });

    withDb.test('Makes the id and the time', async ({ db }) => {
        const [note] = await db.insert(notes).values({ title: 'a', body: 'b' }).returning();

        // A version 7 UUID
        expect(note?.id).to.match(
            /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/v
        );
        expect(note?.createdAt).to.be.an.instanceOf(Date);
    });

    withDb.test('Orders ids made in one transaction', async ({ db }) => {
        const made = await db
            .insert(notes)
            .values(Array.from({ length: 20 }, (_, i) => ({ title: String(i), body: '' })))
            .returning();

        const ids = made.map(({ id }) => id);
        expect(ids).to.deep.equal(ids.toSorted((a, b) => a.localeCompare(b)));
    });

    withDb.test('Has every migration recorded, so migrating does nothing', async ({ db, pool }) => {
        const journal = JSON.parse(
            await readFile(new URL('../../migrations/meta/_journal.json', import.meta.url), 'utf8')
        ) as { readonly entries: readonly unknown[] };
        const recorded = async (): Promise<number> => {
            const { rows } = await pool.query<{ count: number }>(
                'SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations'
            );
            return rows[0]!.count;
        };
        expect(await recorded()).to.equal(journal.entries.length);

        // Running a migration again would fail, as its tables already exist
        await migrate(db, { migrationsFolder });

        expect(await recorded()).to.equal(journal.entries.length);
    });
});
