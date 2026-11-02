import { isCI } from 'ci-info';
import yargs from 'yargs';
import { EntryScript } from 'entry-script';
import { loadAndPopulateFiles } from './lib/load-populate-files.js';

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
 * LoadPopulateFiles CLI. Run `./bin.mjs --help` for options.
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
            .scriptName('load-populate-files')
            .option({
                cwd: {
                    type: 'string',
                    default: '.',
                    describe: 'Relative working directory for all paths',
                },
                targetDir: {
                    type: 'string',
                    default: '.',
                    describe:
                        'Target directory for resolving output file paths. Defaults to resolved cwd.',
                    alias: 't',
                },
            })
            .strict()
            .help()
            .alias('help', 'info')
            .version(packageJson.default.version)
            .command(
                ['$0', 'load-populate-files'],
                'Read pre-generated content and write to file',
                command =>
                    command
                        .options({
                            filePath: {
                                describe: 'File that exports data content to populate',
                                type: 'string',
                                required: true,
                            },
                            ci: {
                                describe: 'Fail if file is not up to date. Implies --dry-run',
                                type: 'boolean',
                                default: isCI,
                                alias: 'check',
                            },
                            dryRun: {
                                describe: 'Do not write file',
                                type: 'boolean',
                                default: false,
                            },
                            clean: {
                                describe:
                                    'Remove files in --target-dir that were not generated. In --ci mode, fail instead of removing.',
                                type: 'boolean',
                                default: false,
                            },
                            force: {
                                describe:
                                    'Overwrite signed files even if they were edited, are not signed, or would lose manual sections',
                                type: 'boolean',
                                default: false,
                            },
                            manifest: {
                                describe:
                                    'Record generated files in this manifest (relative to --cwd), to detect edits to them and only --clean files it lists',
                                type: 'string',
                            },
                        })
                        .strict(),
                async options => {
                    await loadAndPopulateFiles(
                        {
                            filePath: options.filePath,
                        },
                        {
                            cwd: options.cwd,
                            targetDir: options.targetDir,
                            check: options.ci,
                            dryRun: options.dryRun,
                            clean: options.clean,
                            force: options.force,
                            manifest: options.manifest,
                        }
                    );
                }
            )
            .parseAsync(argv, {}, yargsOutput);
    }
}
