import type { Argv } from 'yargs';
import type { Main } from 'entry-script';
import type { NotesCommandInput, RegisterCommand } from './commands/lib/types.js';
import yargs from 'yargs';
import { bind } from 'haywire';
import { commandId } from './commands/lib/types.js';
import { defaultConfigDir } from './lib/environment.js';
import { NotesCliError } from './lib/errors.js';

/**
 * The notes CLI. Run `notes --help` for its commands.
 */
export class NotesCli implements Main {
    readonly #commands: readonly RegisterCommand[];

    /**
     * @param commands - Every command the CLI runs
     */
    public constructor(commands: readonly RegisterCommand[]) {
        this.#commands = commands;
    }

    /**
     * Entry point of the CLI. Options shared by every command are set here; each command adds its own.
     *
     * @param argv - Process arguments
     */
    public async main(argv: string[]): Promise<void> {
        let cli: Argv<NotesCommandInput> = yargs()
            .scriptName('notes')
            .options({
                json: {
                    type: 'boolean',
                    default: false,
                    describe: 'Print JSON, for a program to read',
                },
                configDir: {
                    type: 'string',
                    default: defaultConfigDir(),
                    describe: 'Where the login is kept',
                },
            })
            .demandCommand(1)
            .strict()
            .help()
            // A mistake in the command line says where help is
            .fail(message => {
                throw new NotesCliError(`${message}. Run notes --help for usage.`);
            });
        for (const register of this.#commands) {
            cli = register(cli);
        }
        try {
            await cli.parseAsync(argv, {}, (_error: unknown, _argv: unknown, output: string) => {
                if (output) {
                    console.log(output);
                }
            });
        } catch (error) {
            // One line on stderr, never a stack trace: a failure the CLI expected says what to do, any other what
            // failed
            process.exitCode = 1;
            console.error(
                error instanceof NotesCliError
                    ? error.message
                    : `Failed: ${(error as Error).message}`
            );
        }
    }
}

export const notesCliBinding = bind(NotesCli)
    .withDependencies([commandId])
    .withConstructorProvider();
