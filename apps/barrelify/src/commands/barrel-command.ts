import type { BarrelCommandInput, Command } from './lib/types.js';
import { isCI } from 'ci-info';
import { parseCwd } from 'parse-cwd';
import { barrelFiles } from '../lib/barrel.js';

interface BarrelCommandExtendedInput extends BarrelCommandInput {
    ci: boolean;
    dryRun: boolean;
}

/**
 * Main `barrel` command
 */
export const barrelCommand: Command<BarrelCommandExtendedInput> = {
    command: ['$0', 'barrel'],
    describe: 'Write index.ts barrel files',
    builder: yargs =>
        yargs
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
    handler: async options => {
        const changed = await barrelFiles({
            cwd: await parseCwd(options.cwd),
            dryRun: options.ci || options.dryRun,
            ignore: options.ignore ?? [],
        });

        for (const change of changed) {
            // eslint-disable-next-line no-console
            console.log(change);
        }

        if (options.ci && changed.length > 0) {
            throw new Error('Files are not built');
        }
    },
};
