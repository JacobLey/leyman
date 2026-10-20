import { expect } from '@leyman/expect';
import { before, suite } from 'mocha-chain';
import { dumpSchema, PgDolly } from 'pg-dolly';
import { connect, Server, uniquePrefix } from '../helpers/server.js';

/**
 * Objects an ORM wouldn't see: a function, a trigger and a view, besides a table with a default and an index.
 */
const migration = `
CREATE TABLE item (id integer PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX item_name ON item (name);
CREATE FUNCTION upper_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.name := upper(NEW.name);
    RETURN NEW;
END;
$$;
CREATE TRIGGER upper_name BEFORE INSERT ON item FOR EACH ROW EXECUTE FUNCTION upper_name();
CREATE VIEW item_names AS SELECT name FROM item;
`;

/**
 * Runs the migration, as a project's migrations would.
 *
 * @param url - Database
 */
const migrate = async (url: string): Promise<void> => {
    const client = await connect(url);
    try {
        await client.query(migration);
    } finally {
        await client.end();
    }
};

suite('dumpSchema', () => {
    const withDolly = before(async () => {
        const prefix = uniquePrefix();
        const dolly = await PgDolly.connect({ prefix });
        return { prefix, dolly, empty: await dolly.template('') };
    });
    withDolly.after(async ({ prefix, dolly }) => {
        await dolly.close();
        const server = await Server.connect();
        await server.dropAll(prefix);
        await server.close();
    });

    /**
     * A database migrated from empty, as a project's migrations would build it.
     */
    const withMigrated = withDolly.beforeEach(async ({ empty }) => {
        const database = await empty.clone();
        await migrate(database.url);
        return { database };
    });

    withMigrated.test('Dumps what the migrations built', async ({ database }) => {
        const dump = await dumpSchema(database.url);

        expect(dump).to.include('CREATE TABLE public.item');
        expect(dump).to.include('CREATE INDEX item_name');
        expect(dump).to.include('CREATE FUNCTION public.upper_name()');
        expect(dump).to.include('CREATE TRIGGER upper_name');
        expect(dump).to.include('CREATE VIEW public.item_names');
    });

    withMigrated.test('Dumps the same schema to the same text', async ({ empty, database }) => {
        const other = await empty.clone();
        await migrate(other.url);

        expect(await dumpSchema(other.url)).to.equal(await dumpSchema(database.url));
    });

    withMigrated.test(
        'Leaves out the versions, and the psql-only restrict lines',
        async ({ database }) => {
            const dump = await dumpSchema(database.url);

            expect(dump).to.not.match(/Dumped (?:from|by)|\\(?:un)?restrict/u);
        }
    );

    withMigrated.test('Leaves out owners and privileges', async ({ database }) => {
        const dump = await dumpSchema(database.url);

        expect(dump).to.not.match(/OWNER TO|GRANT|REVOKE/u);
    });

    withMigrated.test('Ends with one newline, and no runs of blank lines', async ({ database }) => {
        const dump = await dumpSchema(database.url);

        expect(dump).to.match(/[^\n]\n$/u);
        expect(dump).to.not.include('\n'.repeat(3));
    });

    withMigrated.test('Builds a template that dumps the same', async ({ dolly, database }) => {
        const dump = await dumpSchema(database.url);
        const template = await dolly.template(dump);
        const clone = await template.clone();

        expect(await dumpSchema(clone.url)).to.equal(dump);
    });
});
