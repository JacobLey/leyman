import type { Argv } from 'yargs';
import type { Command, PgDollySchemaCommandInput } from './lib/types.js';
import { bind } from 'haywire';
import { snapshotSchema } from '../lib/snapshot-schema.js';
import { commandId } from './lib/types.js';

interface SnapshotCommandExtendedInput extends PgDollySchemaCommandInput {
    migrate: string;
    file: string;
    check: boolean | undefined;
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
                prefix: {
                    describe: 'Prefix of the databases created (default pg_dolly)',
                    type: 'string',
                },
            })
            .strict(),
    handler: async options => {
        await snapshotSchema({
            migrate: options.migrate,
            file: options.file,
            cwd: options.cwd,
            check: options.check,
            prefix: options.prefix,
        });
    },
};

export const snapshotCommandBinding = bind(commandId).withInstance(cli =>
    cli.command(snapshotCommand)
);
