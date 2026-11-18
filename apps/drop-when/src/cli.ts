import type { Argv } from 'yargs';
import type { Main } from 'entry-script';
import type { RegisterCommand } from './commands/lib/types.js';
import yargs from 'yargs';
import { bind } from 'haywire';
import { commandId } from './commands/lib/types.js';

/**
 * The drop-when CLI. Run `./bin.mjs --help` for its commands.
 */
export class DropWhenCli implements Main {
    readonly #commands: readonly RegisterCommand[];

    /**
     * @param commands - every command the CLI runs
     */
    public constructor(commands: readonly RegisterCommand[]) {
        this.#commands = commands;
    }

    /**
     * Entry point to the CLI. Each command sets its own options.
     *
     * @param argv - process arguments
     */
    public async main(argv: string[]): Promise<void> {
        let cli: Argv = yargs()
            .scriptName('drop-when')
            .demandCommand(1, 'Choose a command: check or report')
            .strict()
            .help()
            .version(false);

        for (const register of this.#commands) {
            cli = register(cli);
        }

        await cli.parseAsync(argv, {}, DropWhenCli.#yargsOutput);
    }

    static #yargsOutput(this: void, e: Error | undefined, _argv: unknown, log: string): void {
        if (e) {
            process.exitCode = 1;
            console.error(log);
        } else if (log) {
            console.log(log);
        }
    }
}

export const dropWhenCliBinding = bind(DropWhenCli)
    .withDependencies([commandId])
    .withConstructorProvider();
