import type { Argv } from 'yargs';
import type { Main } from 'entry-script';
import type { PgDollySchemaCommandInput, RegisterCommand } from './commands/lib/types.js';
import yargs from 'yargs';
import { bind } from 'haywire';
import { commandId } from './commands/lib/types.js';

/**
 * The `pg-dolly-schema` CLI. Run `./bin.mjs --help` for options.
 *
 * Uses `yargs` package for command line parsing and logic flow.
 */
export class PgDollySchemaCli implements Main {
    readonly #commands: readonly RegisterCommand[];

    /**
     * @param commands - every command the CLI runs
     */
    public constructor(commands: readonly RegisterCommand[]) {
        this.#commands = commands;
    }

    /**
     * Entry point to CLI script.
     *
     * Sets high level Yargs settings. Command/options logic is implemented in individual command modules.
     *
     * @param argv - process arguments
     */
    public async main(argv: string[]): Promise<void> {
        // eslint-disable-next-line import-x/no-relative-parent-imports -- The build is one level below package.json
        const packageJson = await import('../package.json', { with: { type: 'json' } });

        let cli: Argv<PgDollySchemaCommandInput> = yargs()
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
            .version(packageJson.default.version);

        for (const register of this.#commands) {
            cli = register(cli);
        }

        await cli.parseAsync(argv, {}, PgDollySchemaCli.#yargsOutput);
    }

    static #yargsOutput(this: void, e: unknown, _argv: unknown, log: string): void {
        if (e) {
            process.exitCode = 1;
            if (log) {
                console.error(log);
            }
        } else if (log) {
            console.log(log);
        }
    }
}

export const pgDollySchemaCliBinding = bind(PgDollySchemaCli)
    .withDependencies([commandId])
    .withConstructorProvider();
