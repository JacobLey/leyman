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
    /^(?:-- Dumped (?:from database|by pg_dump) version .*|\\(?:un)?restrict .*)$/u;

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
        .replaceAll(/\n{3,}/gu, '\n\n')
        .trim()}\n`;

/**
 * Dumps a database's schema with `pg_dump`, normalized so the same schema always gives the same text, and so any
 * client (including `template()`) can run it. Needs `pg_dump` on the `PATH`, at least the server's major version.
 *
 * Owners, privileges and tablespaces are left out: they name roles and tablespaces of one server, which another may
 * not have.
 *
 * @param url - Database to dump, as a `postgres://` URL
 * @returns The schema as SQL
 */
export const dumpSchema = async (url: string): Promise<string> => {
    const { stdout } = await execFileAsync(
        'pg_dump',
        ['--schema-only', '--no-owner', '--no-privileges', '--no-tablespaces', `--dbname=${url}`],
        { encoding: 'utf8', maxBuffer: maxDumpBytes }
    );
    return normalizeDump(stdout);
};
