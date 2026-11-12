import { createTableSql } from 'idempotency-keys/postgres';
import { before } from 'mocha-chain';
import { PgDolly } from 'pg-dolly';

// At the top level of a module, a hook applies to every test: a root hook, run once per process
const withDolly = before(async () => {
    const dolly = await PgDolly.connect();
    // The library's own DDL, for its default table
    return { dolly, template: await dolly.template(createTableSql()) };
});
withDolly.after(async ({ dolly }) => {
    await dolly.close();
});

export { withDolly };
