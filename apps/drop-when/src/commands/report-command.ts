import type { Command, DropWhenCommandInput } from './lib/types.js';
import { bind } from 'haywire';
import { runReport } from '#internal/lib/report.js';
import { clockId, fetchId } from './lib/dependencies.js';
import { pathsOptions } from './lib/paths.js';
import { commandId } from './lib/types.js';

/* eslint-disable @typescript-eslint/naming-convention -- Option names, as typed on the command line */
interface ReportCommandExtendedInput extends DropWhenCommandInput {
    'min-age': string;
    'fail-on-due': boolean;
}
/* eslint-enable @typescript-eslint/naming-convention */

export const reportCommandBinding = bind(commandId)
    .withDependencies([fetchId, clockId])
    .withProvider((fetch, clock) => {
        /**
         * Resolves every marker against GitHub and prints a Markdown report. It depends on the network and the time,
         * so it never runs in verify.
         */
        const reportCommand: Command<ReportCommandExtendedInput> = {
            command: 'report [paths..]',
            describe: 'Resolve each marker against GitHub, and print what is due as Markdown',
            builder: yargs =>
                pathsOptions(yargs)
                    .options({
                        'min-age': {
                            describe:
                                'How old the release with a fix must be before its marker is due: days or hours, like 7d or 12h',
                            type: 'string',
                            demandOption: true,
                        },
                        'fail-on-due': {
                            describe: 'Also exit with 1 when a marker is due',
                            type: 'boolean',
                            default: false,
                        },
                    })
                    .strict(),
            handler: async ({ paths, exclude, 'min-age': minAge, 'fail-on-due': failOnDue }) => {
                // eslint-disable-next-line n/no-process-env -- The token only raises the rate limit, never changes a result
                const token = process.env.GITHUB_TOKEN;
                const result = await runReport(
                    { cwd: '.', paths, exclude, minAge, failOnDue },
                    { fetch, now: clock(), ...(token !== undefined && { token }) }
                );
                process.stdout.write(result.stdout);
                process.stderr.write(result.stderr);
                process.exitCode = result.exitCode;
            },
        };
        return cli => cli.command(reportCommand);
    });
