import { createRequire } from 'node:module';
import yargsDefault, { type Argv } from 'yargs';
import { defaultImport } from 'default-import';
import { EntryScript } from 'entry-script';
import type { Supplier } from 'haywire';
import type { ConsoleLog, ExitCode } from './commands/lib/dependencies.js';
import type { AbstractCommand } from './commands/lib/types.js';

const packageJson = createRequire(import.meta.url)('../package.json') as { version: string };
const yargs = defaultImport(yargsDefault) as Argv;

/**
 * LoadPopulateFiles CLI. Run `./bin.mjs --help` for options.
 *
 * Uses `yargs` package for command line parsing and logic flow.
 */
export class LoadPopulateFilesCli extends EntryScript {
    readonly #getCommands: Supplier<AbstractCommand[]>;
    readonly #logger: ConsoleLog;
    readonly #errorLogger: ConsoleLog;
    readonly #exitCode: ExitCode;

    public constructor(
        getCommands: Supplier<AbstractCommand[]>,
        logger: ConsoleLog,
        errorLogger: ConsoleLog,
        exitCode: ExitCode
    ) {
        super();
        this.#getCommands = getCommands;
        this.#logger = logger;
        this.#errorLogger = errorLogger;
        this.#exitCode = exitCode;
    }

    /**
     * Entry point to CLI script.
     *
     * Sets high level Yargs settings. Command/options logic is implemented in individual command modules.
     *
     * @param argv - process arguments
     */
    public override async main(argv: string[]): Promise<void> {
        const yarg = yargs()
            .scriptName('load-populate-files')
            .option({
                cwd: {
                    type: 'string',
                    default: '.',
                    describe: 'Relative working directory for all paths',
                },
            })
            .strict()
            .help()
            .alias('help', 'info')
            .version(packageJson.version);

        for (const command of this.#getCommands()) {
            yarg.command(command);
        }

        await yarg.parseAsync(argv, {}, this.#yargsOutput.bind(this));
    }

    #yargsOutput(e: unknown, _argv: unknown, log: string): void {
        if (e) {
            this.#exitCode(1);
            if (log) {
                this.#errorLogger(log);
            }
        } else if (log) {
            this.#logger(log);
        }
    }
}