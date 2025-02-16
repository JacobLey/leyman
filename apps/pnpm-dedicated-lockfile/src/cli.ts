import yargs from 'yargs';
import { EntryScript } from 'entry-script';
import type { Supplier } from 'haywire';
import type { AbstractCommand } from './commands/lib/types.js';
import type { ConsoleLog, ExitCode } from './lib/dependencies.js';

/**
 * Lockfile CLI. Run `./bin.mjs --help` for options.
 *
 * Uses `yargs` package for command line parsing and logic flow.
 */
export class LockfileCli extends EntryScript {
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
        // eslint-disable-next-line import/no-relative-parent-imports
        const packageJson = await import('../package.json', { with: { type: 'json' } });

        const yarg = yargs()
            .scriptName('pnpm-dedicated-lockfile')
            .option({
                cwd: {
                    type: 'string',
                    default: '.',
                    describe: 'Current working directory',
                    alias: 'projectDir',
                },
            })
            .strict()
            .help()
            .alias('help', 'info')
            .version(packageJson.default.version);

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
