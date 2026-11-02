import yargs from 'yargs';
import { EntryScript } from 'entry-script';
import { PgDollyError } from 'pg-dolly';
import { PopulateFilesError } from 'populate-files';
import { PgDollySchemaError } from './lib/errors.js';
import { snapshotSchema } from './lib/snapshot-schema.js';

const yargsOutput = (e: Error | undefined, _argv: unknown, log: string): void => {
    if (e) {
        process.exitCode = 1;
        if (log) {
            console.error(log);
        }
    } else if (log) {
        console.log(log);
    }
};

/**
 * The `pg-dolly-schema` CLI. Run `./bin.mjs --help` for options.
 */
export default class Cli extends EntryScript {
    /**
     * Entry point to CLI script.
     *
     * @param argv - process arguments
     */
    public static override async main(argv: string[]): Promise<void> {
        // eslint-disable-next-line import-x/no-relative-parent-imports -- The build is one level below package.json
        const packageJson = await import('../package.json', { with: { type: 'json' } });

        await yargs()
            .scriptName('pg-dolly-schema')
            .option({
                cwd: {
                    type: 'string',
                    default: '.',
                    describe: 'Directory the migrate command runs in, and paths are relative to',
                },
            })
            .strict()
            .help()
            .alias('help', 'info')
            .version(packageJson.default.version)
            .command(
                ['$0', 'snapshot'],
                'Migrate an empty database and write its schema to a file',
                command =>
                    command
                        // `PG_DOLLY_SCHEMA_MIGRATE`, as Nx forwards options in double quotes, where the shell would expand
                        // `$DATABASE_URL` before the command sees the database it should migrate
                        .env('PG_DOLLY_SCHEMA')
                        .options({
                            migrate: {
                                describe:
                                    'Shell command that migrates the database in DATABASE_URL from empty (or PG_DOLLY_SCHEMA_MIGRATE)',
                                type: 'string',
                                required: true,
                            },
                            file: {
                                describe: 'File to write the schema to, relative to --cwd',
                                type: 'string',
                                default: 'schema.sql',
                            },
                            check: {
                                describe:
                                    'Fail if the file is not up to date, rather than writing it. Defaults to true in CI',
                                type: 'boolean',
                                alias: 'ci',
                            },
                            data: {
                                describe:
                                    "Table to keep the rows of too, e.g. the migration tool's own. Repeat for several",
                                type: 'string',
                                array: true,
                            },
                            prefix: {
                                describe: 'Prefix of the databases created (default pg_dolly)',
                                type: 'string',
                            },
                        })
                        .strict(),
                async options => {
                    try {
                        await snapshotSchema({
                            migrate: options.migrate,
                            file: options.file,
                            cwd: options.cwd,
                            check: options.check,
                            data: options.data,
                            prefix: options.prefix,
                        });
                    } catch (error) {
                        // Expected failures (the migration, the setup, an outdated file) say what to fix, which a stack trace
                        // would bury. Anything else keeps its stack
                        if (
                            error instanceof PgDollySchemaError ||
                            error instanceof PgDollyError ||
                            error instanceof PopulateFilesError
                        ) {
                            console.error(error.message);
                            process.exitCode = 1;
                            return;
                        }
                        throw error;
                    }
                }
            )
            .parseAsync(argv, {}, yargsOutput);
    }
}
