import type { Argv } from 'yargs';
import type { Command, PgDollySchemaCommandInput } from './lib/types.js';
import { bind } from 'haywire';
import { PgDollyError } from 'pg-dolly';
import { PopulateFilesError } from 'populate-files';
import { PgDollySchemaError } from '../lib/errors.js';
import { snapshotSchema } from '../lib/snapshot-schema.js';
import { commandId } from './lib/types.js';

interface SnapshotCommandExtendedInput extends PgDollySchemaCommandInput {
    migrate: string;
    file: string;
    check: boolean | undefined;
    data: string[] | undefined;
    prefix: string | undefined;
}

/**
 * Main `pg-dolly-schema` command
 */
export const snapshotCommand: Command<SnapshotCommandExtendedInput> = {
    command: ['$0', 'snapshot'],
    describe: 'Migrate an empty database and write its schema to a file',
    builder: (yargs: Argv<PgDollySchemaCommandInput>): Argv<SnapshotCommandExtendedInput> =>
        yargs
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
    handler: async options => {
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
    },
};

export const snapshotCommandBinding = bind(commandId).withInstance(cli =>
    cli.command(snapshotCommand)
);
