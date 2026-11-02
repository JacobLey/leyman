import { isCI } from 'ci-info';
import yargs from 'yargs';
import { EntryScript } from 'entry-script';
import { parseCwd } from 'parse-cwd';
import { barrelFiles } from './lib/barrel.js';

const yargsOutput = (e: Error | undefined, _argv: unknown, log: string): void => {
    if (e) {
        process.exitCode = 1;
        if (log) {
            console.error(log);
        }
    } else if (log) {
        console.log(log);
    }
};

/**
 * Barrelify CLI. Run `./bin.mjs --help` for options.
 */
export default class Cli extends EntryScript {
    /**
     * Entry point to CLI script.
     *
     * @param argv - process arguments
     */
    public static override async main(argv: string[]): Promise<void> {
        // eslint-disable-next-line import-x/no-relative-parent-imports -- The build is one level below package.json
        const packageJson = await import('../package.json', { with: { type: 'json' } });

        await yargs()
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
            .version(packageJson.default.version)
            .command(
                ['$0', 'barrel'],
                'Write index.ts barrel files',
                command =>
                    command
                        .options({
                            ci: {
                                describe: 'Fail if files are not up to date. Implies --dry-run',
                                type: 'boolean',
                                default: isCI,
                            },
                            dryRun: {
                                alias: 'dry-run',
                                describe: 'Do not write files',
                                type: 'boolean',
                                default: false,
                            },
                        })
                        .strict(),
                async options => {
                    const changed = await barrelFiles({
                        cwd: await parseCwd(options.cwd),
                        dryRun: options.ci || options.dryRun,
                        ignore: options.ignore ?? [],
                    });

                    for (const change of changed) {
                        console.log(change);
                    }

                    if (options.ci && changed.length > 0) {
                        throw new Error(
                            'Barrel files are out of date. Run barrel without --ci to update them'
                        );
                    }
                }
            )
            .parseAsync(argv, {}, yargsOutput);
    }
}
