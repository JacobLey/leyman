import { randomUUID } from 'node:crypto';
import { cp } from 'node:fs/promises';
import Path from 'node:path';
import { Client } from 'pg';
import { dir } from 'tmp-promise';

/**
 * Applies `migrations/*.sql` in order, as a project's own migrate command would.
 */
export const migrate =
    'for file in migrations/*.sql; do psql --quiet -v ON_ERROR_STOP=1 -f "$file" "$DATABASE_URL" || exit 1; done';

/**
 * As `migrate`, then records the migrations it ran in a table of its own, as migration tools do.
 */
export const migrateTracked = `${migrate} && psql --quiet -v ON_ERROR_STOP=1 -c "CREATE TABLE public.applied (name text PRIMARY KEY); INSERT INTO public.applied VALUES ('001-item'), ('002-upper-name')" "$DATABASE_URL"`;

/**
 * Each test uses its own prefix, so it only ever sees its own databases on the shared server.
 *
 * @returns A prefix no other test uses
 */
export const uniquePrefix = (): string => `t${randomUUID().replaceAll('-', '').slice(0, 12)}`;

export interface Project {
    readonly path: string;
    readonly cleanup: () => Promise<void>;
}

/**
 * A copy of the fixture project (its migrations) in a temporary directory, to write `schema.sql` into.
 *
 * @returns Its directory, and a function that removes it
 */
export const copyProject = async (): Promise<Project> => {
    const { path, cleanup } = await dir({ unsafeCleanup: true });
    await cp(Path.join(import.meta.dirname, '../../test/data'), path, { recursive: true });
    return { path, cleanup };
};

/**
 * Drops every database with the prefix, whatever made it.
 *
 * @param prefix - Database name prefix
 */
export const dropAll = async (prefix: string): Promise<void> => {
    // eslint-disable-next-line n/no-process-env -- Set by the devcontainer and Dagger
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
        const { rows } = await client.query<{ datname: string }>(
            'SELECT datname FROM pg_database WHERE starts_with(datname, $1)',
            [`${prefix}_`]
        );
        for (const { datname } of rows) {
            const name = client.escapeIdentifier(datname);
            await client.query(`ALTER DATABASE ${name} WITH IS_TEMPLATE false`);
            await client.query(`DROP DATABASE ${name} WITH (FORCE)`);
        }
    } finally {
        await client.end();
    }
};

/**
 * List the databases with a prefix that aren't templates.
 *
 * @param prefix - Start of the database names
 * @returns Names of the databases with the prefix that aren't templates
 */
export const clones = async (prefix: string): Promise<string[]> => {
    // eslint-disable-next-line n/no-process-env -- Set by the devcontainer and Dagger
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
        const { rows } = await client.query<{ datname: string }>(
            'SELECT datname FROM pg_database WHERE starts_with(datname, $1) AND NOT datistemplate',
            [`${prefix}_`]
        );
        return rows.map(({ datname }) => datname);
    } finally {
        await client.end();
    }
};
