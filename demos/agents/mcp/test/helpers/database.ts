import type { Context } from 'mocha';
import { readFile } from 'node:fs/promises';
import { before } from 'mocha-chain';
import { PgDolly } from 'pg-dolly';

const schema = await readFile(
    new URL(import.meta.resolve('@leyman/demo-openapi-database/schema.sql')),
    'utf8'
);

// At the top level of a module, a hook applies to every test: a root hook, run once per process
const withDolly = before(async () => {
    const dolly = await PgDolly.connect();
    return { dolly, template: await dolly.template(schema) };
});
withDolly.after(async ({ dolly }) => {
    await dolly.close();
});

/**
 * A database of its own for each test of the suite it's called in, built from `schema.sql`. A failed test's is kept.
 *
 * @returns Fixture, with `database`
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- mocha-chain's fixture type is inferred
export const withDatabase = () => {
    const withClone = withDolly.beforeEach(async ({ template }) => ({
        database: await template.clone(),
    }));
    withClone.afterEach(function (this: Context, { database }) {
        if (this.currentTest?.state === 'failed') {
            database.keep();
        }
    });
    return withClone;
};
