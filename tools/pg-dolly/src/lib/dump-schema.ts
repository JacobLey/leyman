import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * 256 MiB. A large schema dumps to megabytes, beyond `execFile`'s 1 MiB default.
 */
const maxDumpBytes = 268_435_456;

/**
 * Lines that differ between dumps of the same schema, or that only `psql` can run:
 * - the server's and `pg_dump`'s versions, in comments
 * - `\restrict` and `\unrestrict`, which recent `pg_dump` writes with a random key. They are psql meta-commands, so
 *   no other client could run the dump, and they only protect `psql` from a malicious dump.
 */
const unstableLine =
    /^(?:-- Dumped (?:by pg_dump|from database) version .*|\\(?:un)?restrict .*)$/v;

/**
 * Makes the same schema always give the same text: drops the lines that vary, and the blank lines around them.
 *
 * @param dump - Output of `pg_dump --schema-only`
 * @returns Normalized SQL
 */
export const normalizeDump = (dump: string): string =>
    `${dump
        .split('\n')
        .filter(line => !unstableLine.test(line))
        .join('\n')
        .replaceAll(/\n{3,}/gv, '\n\n')
        .trim()}\n`;

export interface DumpSchemaOptions {
    /**
     * Tables to dump the rows of too, after the schema, e.g. a migration tool's own table, so a database built
     * from the dump knows its migrations ran. Each is a `pg_dump --table` pattern, e.g. `drizzle.__drizzle_migrations`.
     * Sequences the tables own are set to match.
     */
    readonly data?: readonly string[] | undefined;
}

/**
 * Runs `pg_dump`, leaving out what is specific to one server: owners, privileges and tablespaces.
 *
 * @param url - As a `postgres://` URL
 * @param args - What to dump
 * @returns What pg_dump wrote
 */
const pgDump = async (url: string, args: readonly string[]): Promise<string> => {
    const { stdout } = await execFileAsync(
        'pg_dump',
        [...args, '--no-owner', '--no-privileges', '--no-tablespaces', `--dbname=${url}`],
        { encoding: 'utf8', maxBuffer: maxDumpBytes }
    );
    return stdout;
};

/**
 * Dumps a database's schema with `pg_dump`, normalized so the same schema always gives the same text, and so any
 * client (including `template()`) can run it. Needs `pg_dump` on the `PATH`, at least the server's major version.
 *
 * Owners, privileges and tablespaces are left out: they name roles and tablespaces of one server, which another may
 * not have.
 *
 * @param url - Database to dump, as a `postgres://` URL
 * @param options - Tables whose rows to dump too
 * @returns The schema as SQL
 * @rejects When `pg_dump` fails: it is not on the `PATH`, or can't connect
 */
export const dumpSchema = async (url: string, options: DumpSchemaOptions = {}): Promise<string> => {
    const { data = [] } = options;
    const [schema, rows] = await Promise.all([
        pgDump(url, ['--schema-only']),
        data.length > 0
            ? // As `INSERT`s, which any client can run, rather than `COPY … FROM stdin`, which only psql can
              pgDump(url, [
                  '--data-only',
                  '--column-inserts',
                  ...data.map(table => `--table=${table}`),
              ])
            : '',
    ]);
    return normalizeDump(`${schema}\n${rows}`);
};
