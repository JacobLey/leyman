import type { DollyDatabase, DollyTemplate, PgDollyOptions } from 'pg-dolly';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { before, suite, test } from 'mocha-chain';
import {
    defaultSettings,
    PgDolly,
    PgDollyClosedError,
    PgDollyError,
    PgDollyMissingUrlError,
    PgDollyPrefixError,
} from 'pg-dolly';
import { connect, Server, serverUrl, uniquePrefix } from '../helpers/server.js';

/**
 * A table with a default and a trigger, which only a schema applied as SQL (not an ORM's model of it) carries.
 */
const schema = `
CREATE TABLE public.item (
    id integer PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.upper_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.name := upper(NEW.name);
    RETURN NEW;
END;
$$;
CREATE TRIGGER upper_name BEFORE INSERT ON public.item FOR EACH ROW EXECUTE FUNCTION public.upper_name();
`;

/**
 * Runs a query on its own connection, as a test would.
 *
 * @param url - Database
 * @param sql - Statement to run
 * @returns Its rows
 */
const query = async <Row>(url: string, sql: string): Promise<Row[]> => {
    const client = await connect(url);
    try {
        const { rows } = await client.query(sql);
        return rows as Row[];
    } finally {
        await client.end();
    }
};

/**
 * @param url - Database
 * @returns Names of its tables in `public`
 */
const tables = async (url: string): Promise<string[]> => {
    const rows = await query<{ tablename: string }>(
        url,
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    );
    return rows.map(({ tablename }) => tablename);
};

/**
 * @param url - Database
 * @param names - Settings to read
 * @returns Each setting's value, as a new connection to the database sees it
 */
const settingsOf = async (
    url: string,
    names: readonly string[]
): Promise<Record<string, string>> => {
    const client = await connect(url);
    try {
        const { rows } = await client.query<{ name: string; value: string }>(
            'SELECT name, current_setting(name) AS value FROM unnest($1::text[]) AS name',
            [names]
        );
        return Object.fromEntries(rows.map(({ name, value }) => [name, value]));
    } finally {
        await client.end();
    }
};

/**
 * @param dolly - Run
 * @returns A clone of the test schema's template
 */
const cloneSchema = async (dolly: PgDolly): Promise<DollyDatabase> => {
    const template = await dolly.template(schema);
    return template.clone();
};

suite('PgDolly', () => {
    const withServer = before(async () => ({ server: await Server.connect() }));
    withServer.after(async ({ server }) => {
        await server.close();
    });

    /**
     * Every test gets its own prefix, opens its dollies with `open`, and has them closed and its databases dropped
     * afterwards, whatever it left behind.
     */
    const withPrefix = withServer.beforeEach(() => {
        const prefix = uniquePrefix();
        const opened: PgDolly[] = [];
        const open = async (options: Omit<PgDollyOptions, 'prefix'> = {}): Promise<PgDolly> => {
            const dolly = await PgDolly.connect({ prefix, ...options });
            opened.push(dolly);
            return dolly;
        };
        return { prefix, opened, open };
    });
    withPrefix.afterEach(async ({ server, prefix, opened }) => {
        await Promise.allSettled(opened.map(async dolly => dolly.close()));
        await server.dropAll(prefix);
    });

    suite('connect', () => {
        suite('Without DATABASE_URL', () => {
            const withoutUrl = before(() => {
                // eslint-disable-next-line n/no-process-env -- What is being tested
                const { DATABASE_URL: url } = process.env;
                // eslint-disable-next-line n/no-process-env -- What is being tested
                delete process.env.DATABASE_URL;
                return { url };
            });
            withoutUrl.after(({ url }) => {
                // eslint-disable-next-line n/no-process-env -- What is being tested
                process.env.DATABASE_URL = url;
            });

            test('Fails without a server to connect to', async () => {
                await expect(PgDolly.connect()).to.be.rejectedWith(PgDollyMissingUrlError);
            });
        });

        test('Connects to DATABASE_URL by default', async () => {
            const dolly = await PgDolly.connect({ prefix: uniquePrefix() });
            await dolly.close();
        });

        withServer.test('Names databases pg_dolly_ by default', async ({ server }) => {
            const dolly = await PgDolly.connect();
            const template = await dolly.template(`-- ${uniquePrefix()}`);
            const database = await template.clone();
            await dolly.close();
            await server.drop(template.name);

            expect(template.name.startsWith('pg_dolly_t_')).to.equal(true);
            expect(database.name.startsWith('pg_dolly_')).to.equal(true);
        });

        test('Rejects a prefix that cannot start a database name', async () => {
            await expect(PgDolly.connect({ prefix: 'Not-Valid' })).to.be.rejectedWith(
                PgDollyPrefixError
            );
        });

        test('Throws errors that share a base class', async () => {
            await expect(PgDolly.connect({ prefix: 'Not-Valid' })).to.be.rejectedWith(PgDollyError);
        });
    });

    suite('template', () => {
        withPrefix.test('Builds a template from the SQL', async ({ server, open }) => {
            const dolly = await open();
            const template = await dolly.template(schema);

            expectTypeOf(template).toEqualTypeOf<DollyTemplate>();
            expect(await server.database(template.name)).to.include({
                datistemplate: true,
                datallowconn: false,
            });
        });

        withPrefix.test(
            'Names the template by its prefix and the hash of the SQL',
            async ({ prefix, open }) => {
                const dolly = await open();
                const template = await dolly.template(schema);

                expect(template.hash).to.match(/^[\da-f]{32}$/u);
                expect(template.name).to.equal(`${prefix}_t_${template.hash}`);
            }
        );

        withPrefix.test('Gives different SQL a different template', async ({ open }) => {
            const dolly = await open();
            const [a, b] = await Promise.all([
                dolly.template(schema),
                dolly.template(`${schema};`),
            ]);

            expect(a.name).to.not.equal(b.name);
        });

        withPrefix.test('Builds a template once per run', async ({ server, prefix, open }) => {
            const dolly = await open();
            const [a, b] = await Promise.all([dolly.template(schema), dolly.template(schema)]);

            expect(a).to.equal(b);
            expect(await server.databases(prefix)).to.have.length(1);
        });

        withPrefix.test('Reuses the template an earlier run built', async ({ server, open }) => {
            const first = await open();
            const { name } = await first.template(schema);
            const built = await server.database(name);
            await first.close();

            const second = await open();
            await second.template(schema);

            const reused = await server.database(name);

            expect(reused?.oid).to.equal(built?.oid);
        });

        withPrefix.test(
            'Builds one template for runs building it at once',
            async ({ server, prefix, open }) => {
                const [a, b] = await Promise.all([open(), open()]);
                await Promise.all([a.template(schema), b.template(schema)]);

                expect(await server.databases(prefix)).to.have.length(1);
            }
        );

        withPrefix.test(
            'Rebuilds a template that allows connections again',
            async ({ server, open }) => {
                const first = await open();
                const { name } = await first.template(schema);
                const built = await server.database(name);
                await first.close();
                await server.query(`ALTER DATABASE "${name}" WITH ALLOW_CONNECTIONS true`);

                const second = await open();
                await second.template(schema);

                const rebuilt = await server.database(name);
                expect(rebuilt?.oid).to.not.equal(built?.oid);
                expect(rebuilt).to.include({ datistemplate: true, datallowconn: false });
            }
        );

        withPrefix.test('Seeds the template with data', async ({ open }) => {
            const dolly = await open();
            const template = await dolly.template(schema, {
                seed: "INSERT INTO item (id, name) VALUES (1, 'dolly')",
            });
            const database = await template.clone();

            expect(await query(database.url, 'SELECT id, name FROM item')).to.deep.equal([
                { id: 1, name: 'DOLLY' },
            ]);
        });

        withPrefix.test('Gives a different seed a different template', async ({ open }) => {
            const dolly = await open();
            const [unseeded, a, b] = await Promise.all([
                dolly.template(schema),
                dolly.template(schema, { seed: "INSERT INTO item (id, name) VALUES (1, 'a')" }),
                dolly.template(schema, { seed: "INSERT INTO item (id, name) VALUES (1, 'b')" }),
            ]);

            const names = new Set([unseeded.name, a.name, b.name]);

            expect(names.size).to.equal(3);
        });

        withPrefix.test('Gives an empty seed the template without one', async ({ open }) => {
            const dolly = await open();
            const [unseeded, empty] = await Promise.all([
                dolly.template(schema),
                dolly.template(schema, { seed: '' }),
            ]);

            expect(empty).to.equal(unseeded);
        });

        withPrefix.test('Builds the template with the settings', async ({ open }) => {
            const dolly = await open({ settings: { TimeZone: 'Asia/Tokyo' } });
            const template = await dolly.template(schema, {
                seed: "INSERT INTO item (id, name) VALUES (1, current_setting('TimeZone'))",
            });
            const database = await template.clone();

            expect(await query(database.url, 'SELECT name FROM item')).to.deep.equal([
                { name: 'ASIA/TOKYO' },
            ]);
        });

        withPrefix.test('Gives other settings a different template', async ({ open }) => {
            const [utc, tokyo] = await Promise.all([
                open(),
                open({ settings: { TimeZone: 'Asia/Tokyo' } }),
            ]);

            const [a, b] = await Promise.all([utc.template(schema), tokyo.template(schema)]);

            expect(a.name).to.not.equal(b.name);
        });

        withPrefix.test(
            'Rejects an invalid setting, leaving nothing behind',
            async ({ server, prefix, open }) => {
                const dolly = await open({ settings: { TimeZone: 'Nowhere/Land' } });

                await expect(dolly.template(schema)).to.be.rejectedWith(
                    'invalid value for parameter "TimeZone"'
                );
                expect(await server.databases(prefix)).to.deep.equal([]);
            }
        );

        withPrefix.test(
            'Rejects a seed that fails, leaving nothing behind',
            async ({ server, prefix, open }) => {
                const dolly = await open();

                await expect(
                    dolly.template(schema, { seed: 'INSERT INTO missing VALUES (1)' })
                ).to.be.rejectedWith(Error);
                expect(await server.databases(prefix)).to.deep.equal([]);
            }
        );

        withPrefix.test('Builds an empty template from no SQL', async ({ open }) => {
            const dolly = await open();
            const template = await dolly.template('');
            const database = await template.clone();

            expect(await tables(database.url)).to.deep.equal([]);
        });

        withPrefix.test(
            'Rejects SQL that fails, leaving nothing behind',
            async ({ server, prefix, open }) => {
                const dolly = await open();

                await expect(dolly.template('CREATE TABLE broken (')).to.be.rejectedWith(Error);
                expect(await server.databases(prefix)).to.deep.equal([]);
            }
        );

        withPrefix.test('Tries a failed build again', async ({ open }) => {
            const dolly = await open();
            await expect(dolly.template('CREATE TABLE broken (')).to.be.rejectedWith(Error);

            await expect(dolly.template('CREATE TABLE broken (')).to.be.rejectedWith(Error);
        });

        withPrefix.test('Builds other templates after a failed one', async ({ open }) => {
            const dolly = await open();
            const [failed, built] = await Promise.allSettled([
                dolly.template('CREATE TABLE broken ('),
                dolly.template(schema),
            ]);

            expect(failed.status).to.equal('rejected');
            expect(built.status).to.equal('fulfilled');
        });
    });

    suite('clone', () => {
        const withTemplate = withPrefix.beforeEach(async ({ open }) => {
            const dolly = await open();
            return { dolly, template: await dolly.template(schema) };
        });

        withTemplate.test('Clones the schema, triggers included', async ({ template }) => {
            const database = await template.clone();
            expectTypeOf(database).toEqualTypeOf<DollyDatabase>();

            await query(database.url, "INSERT INTO item (id, name) VALUES (1, 'dolly')");

            expect(await query(database.url, 'SELECT name FROM item')).to.deep.equal([
                { name: 'DOLLY' },
            ]);
        });

        withTemplate.test('Gives each clone a database of its own', async ({ template }) => {
            const [a, b] = await Promise.all([template.clone(), template.clone()]);
            await query(a.url, "INSERT INTO item (id, name) VALUES (1, 'a')");

            expect(a.name).to.not.equal(b.name);
            expect(await query(b.url, 'SELECT * FROM item')).to.deep.equal([]);
        });

        withTemplate.test('Names clones with the prefix', async ({ prefix, template }) => {
            const database = await template.clone();

            expect(database.name.startsWith(`${prefix}_`)).to.equal(true);
        });

        withTemplate.test(
            'Gives the URL of the server, with the clone as database',
            async ({ template }) => {
                const database = await template.clone();
                const url = new URL(database.url);
                const server = new URL(serverUrl);

                expect(url.pathname).to.equal(`/${database.name}`);
                expect(url.host).to.equal(server.host);
                expect(url.username).to.equal(server.username);
            }
        );

        withTemplate.test(
            'Pins the settings initdb takes from the machine',
            async ({ template }) => {
                const database = await template.clone();

                expect(await settingsOf(database.url, Object.keys(defaultSettings))).to.deep.equal({
                    TimeZone: 'UTC',
                    DateStyle: 'ISO, MDY',
                    lc_monetary: 'C',
                    lc_numeric: 'C',
                    lc_time: 'C',
                    default_text_search_config: 'pg_catalog.simple',
                });
            }
        );

        withPrefix.test('Applies the settings given, over the defaults', async ({ open }) => {
            const dolly = await open({
                settings: {
                    TimeZone: 'America/New_York',
                    search_path: ['app', 'public'],
                    'app.tenant': "it's",
                },
            });
            const database = await cloneSchema(dolly);

            expect(
                await settingsOf(database.url, ['TimeZone', 'search_path', 'app.tenant', 'lc_time'])
            ).to.deep.equal({
                TimeZone: 'America/New_York',
                search_path: 'app, public',
                'app.tenant': "it's",
                lc_time: 'C',
            });
        });

        withPrefix.test('Overrides a default named in another case', async ({ open }) => {
            const dolly = await open({
                settings: { TIMEZONE: 'America/New_York', LC_TIME: 'POSIX' },
            });
            const database = await cloneSchema(dolly);

            expect(await settingsOf(database.url, ['TimeZone', 'lc_time'])).to.deep.equal({
                TimeZone: 'America/New_York',
                lc_time: 'POSIX',
            });
        });

        withPrefix.test('Shares a template between cases of a name', async ({ open }) => {
            const [lower, mixed] = await Promise.all([
                open({ settings: { timezone: 'Asia/Tokyo' } }),
                open({ settings: { TimeZone: 'Asia/Tokyo' } }),
            ]);

            const [a, b] = await Promise.all([lower.template(schema), mixed.template(schema)]);

            expect(a.name).to.equal(b.name);
        });

        withPrefix.test('Applies an empty list', async ({ open }) => {
            const dolly = await open({ settings: { search_path: [] } });
            const database = await cloneSchema(dolly);

            expect(await settingsOf(database.url, ['search_path'])).to.deep.equal({
                search_path: '""',
            });
        });
    });

    suite('close', () => {
        const withTemplate = withPrefix.beforeEach(async ({ open }) => {
            const dolly = await open();
            return { dolly, template: await dolly.template(schema) };
        });

        withTemplate.test(
            'Drops the clones and keeps the template',
            async ({ server, prefix, dolly, template }) => {
                await Promise.all([template.clone(), template.clone()]);

                await dolly.close();

                expect(await server.names(prefix)).to.deep.equal([template.name]);
            }
        );

        withTemplate.test('Keeps the clones kept', async ({ server, dolly, template }) => {
            const [kept, dropped] = await Promise.all([template.clone(), template.clone()]);
            kept.keep();
            kept.keep();

            await dolly.close();

            expect(await server.database(kept.name)).to.not.equal(undefined);
            expect(await server.database(dropped.name)).to.equal(undefined);
        });

        withTemplate.test('Does nothing when called again', async ({ dolly }) => {
            await Promise.all([dolly.close(), dolly.close()]);
            await dolly.close();
        });

        withTemplate.test('Refuses templates once closed', async ({ dolly }) => {
            await dolly.close();

            await expect(dolly.template(schema)).to.be.rejectedWith(PgDollyClosedError);
        });

        withTemplate.test('Refuses clones once closed', async ({ dolly, template }) => {
            await dolly.close();

            await expect(template.clone()).to.be.rejectedWith(PgDollyClosedError);
        });
    });

    suite('Leftovers', () => {
        /**
         * A run whose admin connection can be ended, as if its process crashed.
         */
        const withCrash = withPrefix.beforeEach(({ prefix, open }) => {
            const url = new URL(serverUrl);
            url.searchParams.set('application_name', prefix);
            return { crashable: async () => open({ url: url.href }) };
        });

        withCrash.test(
            'Drops the clones of a run that crashed',
            async ({ server, prefix, crashable, open }) => {
                const crashed = await crashable();
                const database = await cloneSchema(crashed);
                await server.terminate(prefix);

                await open();

                expect(await server.database(database.name)).to.equal(undefined);
            }
        );

        withCrash.test(
            'Drops what a crashed run left once, with runs connecting at once',
            async ({ server, prefix, crashable, open }) => {
                const crashed = await crashable();
                const template = await crashed.template(schema);
                await Promise.all([template.clone(), template.clone(), template.clone()]);
                await server.terminate(prefix);

                await Promise.all([open(), open(), open(), open()]);

                expect(await server.names(prefix)).to.deep.equal([template.name]);
            }
        );

        withCrash.test(
            'Drops a database a crashed run left invalid',
            async ({ server, prefix, crashable, open }) => {
                const crashed = await crashable();
                const database = await cloneSchema(crashed);
                await server.terminate(prefix);
                await server.invalidate(database.name);

                await open();

                expect(await server.database(database.name)).to.equal(undefined);
            }
        );

        withPrefix.test(
            'Drops a database a crashed run created but never marked',
            async ({ server, prefix, open }) => {
                // The name a run gives, with no marker: the run crashed between creating and marking it
                const name = `${prefix}_${'0'.repeat(12)}_1`;
                await server.query(`CREATE DATABASE ${name}`);

                await open();

                expect(await server.database(name)).to.equal(undefined);
            }
        );

        withPrefix.test(
            'Leaves an unmarked database of a run still going',
            async ({ server, open }) => {
                const running = await open();
                const database = await cloneSchema(running);
                const name = database.name.replace(/_\d+$/u, '_99');
                await server.query(`CREATE DATABASE ${name}`);

                await open({ retainMs: 0 });

                expect(await server.database(name)).to.not.equal(undefined);
            }
        );

        withPrefix.test('Leaves the clones of a run still going', async ({ server, open }) => {
            const running = await open();
            const database = await cloneSchema(running);

            await open({ retainMs: 0 });

            expect(await server.database(database.name)).to.not.equal(undefined);
        });

        withPrefix.test('Leaves a kept clone until retainMs passes', async ({ server, open }) => {
            const run = await open();
            const database = await cloneSchema(run);
            database.keep();
            await run.close();

            await open();

            expect(await server.database(database.name)).to.not.equal(undefined);
        });

        withPrefix.test('Drops a kept clone once retainMs passes', async ({ server, open }) => {
            const run = await open();
            const database = await cloneSchema(run);
            database.keep();
            await run.close();

            await open({ retainMs: 0 });

            expect(await server.database(database.name)).to.equal(undefined);
        });

        withPrefix.test('Drops a template no run used for retainMs', async ({ server, open }) => {
            const run = await open();
            const { name } = await run.template(schema);
            await run.close();

            await open({ retainMs: 0 });

            expect(await server.database(name)).to.equal(undefined);
        });

        withPrefix.test('Leaves a template a run is using', async ({ server, open }) => {
            const run = await open();
            const { name } = await run.template(schema);

            await open({ retainMs: 0 });

            expect(await server.database(name)).to.not.equal(undefined);
        });

        withPrefix.test('Leaves a template used within retainMs', async ({ server, open }) => {
            const run = await open();
            const { name } = await run.template(schema);
            await run.close();

            await open();

            expect(await server.database(name)).to.not.equal(undefined);
        });

        withPrefix.test(
            'Never drops a database it did not make',
            async ({ server, prefix, open }) => {
                const otherPrefix = JSON.stringify({
                    pgDolly: 1,
                    prefix: 'other',
                    kind: 'clone',
                    run: 'gone',
                });
                await server.query(`CREATE DATABASE ${prefix}_unmarked`);
                await server.query(`CREATE DATABASE ${prefix}_not_json`);
                await server.query(`COMMENT ON DATABASE ${prefix}_not_json IS 'not json'`);
                await server.query(`CREATE DATABASE ${prefix}_other_prefix`);
                await server.query(
                    `COMMENT ON DATABASE ${prefix}_other_prefix IS '${otherPrefix}'`
                );

                await open({ retainMs: 0 });

                expect(await server.names(prefix)).to.deep.equal([
                    `${prefix}_not_json`,
                    `${prefix}_other_prefix`,
                    `${prefix}_unmarked`,
                ]);
            }
        );
    });

    suite('Failures', () => {
        /**
         * Runs as a role that can create databases, but not drop the server user's, so a drop can fail.
         */
        const withRole = withPrefix.beforeEach(async ({ server, prefix }) => {
            const role = `${prefix}_role`;
            const url = new URL(await server.createRole(role));
            url.searchParams.set('application_name', role);
            return { role, roleUrl: url.href };
        });
        withRole.afterEach(async ({ server, prefix, opened, role }) => {
            // Before the outer hook drops them, so the role owns nothing once dropped
            await Promise.allSettled(opened.map(async dolly => dolly.close()));
            await server.dropAll(prefix);
            await server.dropRole(role);
        });

        withRole.test(
            'Closes its connection when connect fails',
            async ({ server, prefix, role, roleUrl }) => {
                // Left by a run that is gone, and owned by a user the role can't drop databases of
                const marker = JSON.stringify({ prefix, pgDolly: 1, kind: 'clone', run: 'gone' });
                await server.query(`CREATE DATABASE ${prefix}_gone_1`);
                await server.query(`COMMENT ON DATABASE ${prefix}_gone_1 IS '${marker}'`);

                await expect(PgDolly.connect({ prefix, url: roleUrl })).to.be.rejectedWith(Error);

                expect(await server.disconnected(role)).to.equal(true);
            }
        );

        withRole.test(
            'Closes its connection when a drop fails',
            async ({ server, prefix, opened, role, roleUrl }) => {
                const dolly = await PgDolly.connect({ prefix, url: roleUrl });
                opened.push(dolly);
                const database = await cloneSchema(dolly);
                await server.query(`ALTER DATABASE ${database.name} OWNER TO CURRENT_USER`);

                await expect(dolly.close()).to.be.rejectedWith(Error);

                expect(await server.disconnected(role)).to.equal(true);
            }
        );

        withPrefix.test('Closes after a test dropped its clone', async ({ server, open }) => {
            const dolly = await open();
            const database = await cloneSchema(dolly);
            await server.drop(database.name);

            await dolly.close();
        });
    });
});
