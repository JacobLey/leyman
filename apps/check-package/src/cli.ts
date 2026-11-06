import Path from 'node:path';
import yargs from 'yargs';
import { EntryScript } from 'entry-script';
import { checkPackage } from './lib/check-package.js';
import { packManagers } from './lib/root.js';
import { profiles } from './lib/types-resolution.js';

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
 * Check-package CLI. Run `./bin.mjs --help` for options.
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
            .scriptName('check-package')
            .strict()
            .help()
            .version(packageJson.default.version)
            .command(
                '$0',
                'Check a package exactly as it would be published',
                command =>
                    command
                        .options({
                            cwd: {
                                describe: 'The package directory',
                                type: 'string',
                                default: '.',
                            },
                            root: {
                                describe:
                                    'The workspace root. Defaults to the nearest directory with a lockfile',
                                type: 'string',
                            },
                            packWith: {
                                alias: 'pack-with',
                                describe:
                                    "The package manager that packs it. Defaults to the root lockfile's",
                                choices: packManagers,
                            },
                            profile: {
                                describe:
                                    'The module resolutions every entry point must work under',
                                choices: Object.keys(profiles) as (keyof typeof profiles)[],
                                default: 'strict' as const,
                            },
                            notPublished: {
                                alias: 'not-published',
                                describe:
                                    'A top-level path that is never published, besides the defaults',
                                type: 'array',
                                string: true,
                            },
                            floorTsconfig: {
                                alias: 'floor-tsconfig',
                                describe:
                                    'The config tsconfig.json must extend, relative to the root, with {major} for the support floor',
                                type: 'string',
                            },
                            tsc: {
                                describe: 'Path of tsc. Defaults to the nearest installed one',
                                type: 'string',
                            },
                        })
                        .strict(),
                async options => {
                    const { problems, suggestions } = await checkPackage({
                        cwd: options.cwd,
                        ...(options.root !== undefined && { root: options.root }),
                        ...(options.packWith !== undefined && { packWith: options.packWith }),
                        profile: options.profile,
                        notPublished: options.notPublished ?? [],
                        ...(options.floorTsconfig !== undefined && {
                            floorTsconfig: options.floorTsconfig,
                        }),
                        ...(options.tsc !== undefined && { tsc: options.tsc }),
                    });
                    for (const suggestion of suggestions) {
                        console.log(suggestion);
                    }
                    if (problems.length > 0) {
                        console.error(problems.join('\n'));
                        process.exitCode = 1;
                    } else {
                        console.log(
                            `${Path.basename(Path.resolve(options.cwd))}: publint, attw, the floor, the published files and tsc found no problems`
                        );
                    }
                }
            )
            .parseAsync(argv, {}, yargsOutput);
    }
}
