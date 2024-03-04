import { parseCwd } from 'parse-cwd';
import type { CommandModule } from 'yargs';
import { barrelFiles } from '../lib/barrel.js';

export const barrel: CommandModule<
    {
        cwd: string;
        ignore: string[] | undefined;
    },
    {
        ci: boolean;
        cwd: string;
        dryRun: boolean;
        ignore: string[] | undefined;
    }
> = {
    command: '$0',
    describe: 'Write index.ts barrel files',
    builder: yargs =>
        yargs
            .options({
                ci: {
                    describe:
                        'Fail if files are not up to date. Implies --dry-run',
                    type: 'boolean',
                    default: false,
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
        const cwd = await parseCwd(options.cwd);

        const changed = await barrelFiles({
            cwd,
            dryRun: options.ci || options.dryRun,
            ignore: options.ignore,
            logger: console,
        });

        if (options.ci && changed.length > 0) {
            process.exitCode = 1;
            console.error('Files are not built');
        }
    },
};
