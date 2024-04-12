import yargsDefault, { type Argv, type CommandModule } from 'yargs';
import { hideBin } from 'yargs/helpers';
import { defaultImport } from 'default-import';
import { EntryScript } from 'entry-script';
import { findImport } from 'find-import';
import { patch } from 'named-patch';
import * as Commands from './commands/index.js';

const yargs = defaultImport(yargsDefault) as Argv;

export const yargsOutput = patch(
    (e: unknown, argv: unknown, log: string): void => {
        if (log) {
            // eslint-disable-next-line no-console
            console.log(log);
        }
    }
);

/**
 * Barrelify CLI. Run `./cli.mjs --help` for options.
 *
 * Uses `yargs` package for command line parsing and logic flow.
 */
export default class BarrelCli extends EntryScript {
    readonly #argv: string[];

    /**
     * Create CLI given args.
     *
     * @param params - required parameters
     * @param params.argv - args from CLI process
     */
    public constructor(params: {
        argv: string[];
    }) {
        super();
        this.#argv = hideBin(params.argv);
    }

    /**
     * Pass process.argv to cli.
     *
     * @returns barrel cli instance
     */
    public static override async create(): Promise<BarrelCli> {
        return new BarrelCli({ argv: process.argv });
    }

    /**
     * Entry point to CLI script.
     *
     * Sets high level Yargs settings. Command/options logic is implemented in individual command modules.
     */
    public override async start(): Promise<void> {
        const pkg = await findImport<{
            version: string;
        }>('package.json', {
            cwd: import.meta.url,
        });

        const yarg = (yargs() as unknown as Argv)
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
            .version(pkg!.content.version);

        for (const command of Object.values(Commands)) {
            const typedCommand: typeof command extends CommandModule<
                infer T,
                any
            >
                ? typeof yarg extends Argv<T>
                    ? CommandModule<T, any>
                    : never
                : never = command;

            yarg.command(typedCommand);
        }

        await yarg.parseAsync(this.#argv, {}, yargsOutput);
    }
}
