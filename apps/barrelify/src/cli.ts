import yargsDefault, { type Argv, type CommandModule } from 'yargs';
import { defaultImport } from 'default-import';
import { EntryScript } from 'entry-script';
import { findImport } from 'find-import';
import { patch } from 'named-patch';
import * as Commands from './commands/index.js';

const yargs = defaultImport(yargsDefault) as Argv;

export const yargsOutput = patch((_e: unknown, _argv: unknown, log: string): void => {
    if (log) {
        // eslint-disable-next-line no-console
        console.log(log);
    }
});

/**
 * Barrelify CLI. Run `./cli.mjs --help` for options.
 *
 * Uses `yargs` package for command line parsing and logic flow.
 */
export class BarrelCli extends EntryScript {
    /**
     * Entry point to CLI script.
     *
     * Sets high level Yargs settings. Command/options logic is implemented in individual command modules.
     *
     * @param argv - process arguments
     */
    public override async main(argv: string[]): Promise<void> {
        const pkg = await findImport('package.json', {
            cwd: import.meta.url,
        });

        const yarg = yargs()
            .scriptName('barrelify')
            .option({
                cwd: {
                    type: 'string',
                    default: '.',
                    describe: 'Current working directory',
                },
                ignore: {
                    describe: 'Glob to ignore',
                    type: 'array',
                    string: true,
                },
            })
            .strict()
            .help()
            .alias('help', 'info')
            .version((pkg!.content as { version: string }).version);

        for (const command of Object.values(Commands)) {
            const typedCommand: typeof command extends CommandModule<infer T, any>
                ? typeof yarg extends Argv<T>
                    ? CommandModule<T, any>
                    : never
                : never = command;

            yarg.command(typedCommand);
        }

        await yarg.parseAsync(argv, {}, yargsOutput);
    }
}

export default new BarrelCli();
