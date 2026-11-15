import type { Context } from 'mocha';
import { readFile } from 'node:fs/promises';
import { Client, Pool } from 'pg';
import { before } from 'mocha-chain';
import { PgDolly } from 'pg-dolly';

const schema = await readFile(new URL('../../schema.sql', import.meta.url), 'utf8');

// At the top level of a module, a hook applies to every test: a root hook, run once per process
const withDolly = before(async () => {
    const dolly = await PgDolly.connect();
    return { dolly, template: await dolly.template(schema) };
});
withDolly.after(async ({ dolly }) => {
    await dolly.close();
});

/**
 * A database of its own for each test of the suite it's called in, holding `schema.sql`, with a small pool and a
 * client to listen on. A failed test's database is kept.
 *
 * @returns Fixture, with `database`, `pool` and `listener`
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- mocha-chain's fixture type is inferred
export const withDatabase = () => {
    const withClone = withDolly.beforeEach(async ({ template }) => {
        const database = await template.clone();
        const listener = new Client({ connectionString: database.url });
        await listener.connect();
        // Keep pools small: every test shares the server's `max_connections`
        return { database, listener, pool: new Pool({ connectionString: database.url, max: 3 }) };
    });
    withClone.afterEach(async function (this: Context, { database, pool, listener }) {
        await Promise.all([pool.end(), listener.end()]);
        if (this.currentTest?.state === 'failed') {
            database.keep();
        }
    });
    return withClone;
};

/**
 * Ends every lease and retry delay, as if the time had passed: tests never wait for it.
 *
 * @param pool - Test database
 */
export const expireLeases = async (pool: Pool): Promise<void> => {
    await pool.query("UPDATE outbox SET available_at = now() - interval '1 millisecond'");
};

/**
 * Outbox rows' state, by id.
 *
 * @param pool - Test database
 * @returns Rows in id order
 */
export const outboxRows = async (
    pool: Pool
): Promise<
    { id: string; attempts: number; sent: boolean; failed: boolean; lastError: string | null }[]
> => {
    const { rows } = await pool.query<{
        id: string;
        attempts: number;
        sent: boolean;
        failed: boolean;
        lastError: string | null;
    }>(
        `SELECT id, attempts, sent_at IS NOT NULL AS sent, failed_at IS NOT NULL AS failed, last_error AS "lastError"
        FROM outbox ORDER BY id`
    );
    return rows;
};
