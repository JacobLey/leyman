import type { Context } from 'mocha';
import { Client, Pool } from 'pg';
import { createTableSql } from 'idempotency-keys';
import { before } from 'mocha-chain';
import { PgDolly } from 'pg-dolly';

// At the top level of a module, a hook applies to every test: a root hook, run once per process
const withDolly = before(async () => {
    const dolly = await PgDolly.connect();
    return { dolly, template: await dolly.template(createTableSql()) };
});
withDolly.after(async ({ dolly }) => {
    await dolly.close();
});

/**
 * A database of its own for each test of the suite it's called in, holding the default table, with a small pool
 * and a client to listen on. A failed test's database is kept.
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
