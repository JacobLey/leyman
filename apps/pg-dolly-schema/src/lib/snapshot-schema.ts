import { spawn } from 'node:child_process';
import { dumpSchema, PgDolly } from 'pg-dolly';
import { populateFile } from 'populate-files';
import { PgDollySchemaEmptyError, PgDollySchemaMigrateError } from './errors.js';

export interface SnapshotSchemaOptions {
    /**
     * Shell command that migrates the database in `DATABASE_URL` from empty, e.g. `drizzle-kit migrate`.
     */
    readonly migrate: string;
    /**
     * Where the schema is written, relative to `cwd`.
     *
     * @default 'schema.sql'
     */
    readonly file?: string | undefined;
    /**
     * Directory the migrate command runs in, and `file` is relative to.
     *
     * @default process.cwd()
     */
    readonly cwd?: string | undefined;
    /**
     * Fail if the file isn't up to date, rather than writing it.
     *
     * @default true in CI
     */
    readonly check?: boolean | undefined;
    /**
     * Server to migrate a database on, as a `postgres://` URL.
     *
     * @default process.env.DATABASE_URL
     */
    readonly url?: string | undefined;
    /**
     * Tables to keep the rows of too, e.g. the migration tool's own (`drizzle.__drizzle_migrations`), so a database
     * built from the file knows its migrations ran, and migrating it does nothing. Each is a `pg_dump --table`
     * pattern.
     */
    readonly data?: readonly string[] | undefined;
    /**
     * Prefix of the databases created, as in `PgDolly.connect()`.
     *
     * @default 'pg_dolly'
     */
    readonly prefix?: string | undefined;
}

/**
 * Runs the command, with `DATABASE_URL` set to the database.
 *
 * @param command - Shell command
 * @param cwd - Directory it runs in
 * @param url - Database
 * @returns Its exit code
 */
const run = async (command: string, cwd: string, url: string): Promise<number | null> =>
    new Promise((resolve, reject) => {
        const child = spawn(command, {
            cwd,
            // eslint-disable-next-line n/no-process-env -- The migrations see everything else as the caller does
            env: { ...process.env, DATABASE_URL: url },
            shell: true,
            stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('close', resolve);
    });

/**
 * Migrates an empty database, dumps its schema, and writes it to `file` (or, with `check`, fails if `file` differs).
 *
 * The dump is also built as a template, which proves it applies as is, and leaves it ready for tests.
 *
 * @param options - The migrate command, and where the schema goes
 * @throws {PgDollySchemaMigrateError} When the migrate command fails
 * @throws {PgDollySchemaEmptyError} When the migrate command leaves the database empty
 * @throws {Error} `pg-dolly`'s `PgDollyMissingUrlError` without `url` or `DATABASE_URL`, and `PgDollyPrefixError` for an
 * invalid `prefix`
 */
export const snapshotSchema = async (options: SnapshotSchemaOptions): Promise<void> => {
    const cwd = options.cwd ?? process.cwd();
    const dolly = await PgDolly.connect({ url: options.url, prefix: options.prefix });
    try {
        const empty = await dolly.template('');
        // A second, left empty, to tell whether the migrations built anything
        const [database, blank] = await Promise.all([empty.clone(), empty.clone()]);
        const exitCode = await run(options.migrate, cwd, database.url);
        if (exitCode !== 0) {
            database.keep();
            throw new PgDollySchemaMigrateError(options.migrate, exitCode, database.name);
        }
        const [schema, emptySchema] = await Promise.all([
            dumpSchema(database.url, { data: options.data }),
            dumpSchema(blank.url),
        ]);
        if (schema === emptySchema) {
            throw new PgDollySchemaEmptyError(options.migrate);
        }
        await dolly.template(schema);
        await populateFile(
            { filePath: options.file ?? 'schema.sql', content: schema },
            { cwd, check: options.check }
        );
    } finally {
        await dolly.close();
    }
};
