import { fileURLToPath } from 'node:url';
import yargs from 'yargs';
import { EntryScript } from 'entry-script';
import { audit } from './lib/audit.js';
import { tiers } from './lib/checks.js';
import { formatReport } from './lib/format.js';

/**
 * The agent audit brief, shipped next to the build.
 */

const skill = fileURLToPath(new URL('../skills/framework-audit/SKILL.md', import.meta.url));

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
 * The `leyman-framework` CLI. Run `./bin.mjs --help` for its commands.
 */
export default class Cli extends EntryScript {
    /**
     * Entry point to the CLI.
     *
     * @param argv - process arguments
     */
    public static override async main(argv: string[]): Promise<void> {
        // eslint-disable-next-line import-x/no-relative-parent-imports -- The build is one level below package.json
        const packageJson = await import('../package.json', { with: { type: 'json' } });

        await yargs()
            .scriptName('leyman-framework')
            .strict()
            .help()
            .version(packageJson.default.version)
            .demandCommand(1)
            .command(
                'audit',
                'Report the tier of the framework a repository meets, and how to fix each gap',
                command =>
                    command
                        .options({
                            cwd: {
                                describe: 'Root of the repository',
                                type: 'string',
                                default: '.',
                            },
                            offline: {
                                describe: "Skip what needs npm's registry",
                                type: 'boolean',
                                default: false,
                            },
                            tier: {
                                describe: 'Fail unless the repository meets this tier',
                                type: 'number',
                                choices: tiers,
                            },
                        })
                        .strict(),
                async options => {
                    const report = await audit({
                        cwd: options.cwd,
                        ...(options.offline && { latestVersion: false }),
                    });
                    console.log(formatReport(report, skill));
                    if (options.tier !== undefined && report.tier < options.tier) {
                        process.exitCode = 1;
                    }
                }
            )
            .parseAsync(argv, {}, yargsOutput);
    }
}
