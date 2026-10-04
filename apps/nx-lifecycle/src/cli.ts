import yargs from 'yargs';
import { EntryScript } from 'entry-script';
import { lifecycleCommand } from './commands/lifecycle-command.js';

/**
 * Lifecycle CLI. Run `./bin.mjs --help` for options.
 *
 * Uses `yargs` package for command line parsing and logic flow.
 */
export class LifecycleCli extends EntryScript {
    /**
     * Entry point to CLI script.
     *
     * Sets high level Yargs settings. Command/options logic is implemented in individual command modules.
     *
     * @param argv - process arguments
     */
    public static override async main(argv: string[]): Promise<void> {
        // eslint-disable-next-line import/no-relative-parent-imports
        const packageJson = await import('../package.json', { with: { type: 'json' } });

        await yargs()
            .scriptName('lifecycle')
            .option({
                cwd: {
                    type: 'string',
                    default: '.',
                    describe: 'Directory to resolve all other paths from',
                },
            })
            .strict()
            .help()
            .alias('help', 'info')
            .version(packageJson.default.version)
            .command(lifecycleCommand)
            .parseAsync(argv, {}, LifecycleCli.#yargsOutput);
    }

    static #yargsOutput(this: void, e: unknown, _argv: unknown, log: string): void {
        if (e) {
            process.exitCode = 1;
            if (log) {
                // eslint-disable-next-line no-console
                console.error(log);
            }
        } else if (log) {
            // eslint-disable-next-line no-console
            console.log(log);
        }
    }
}
