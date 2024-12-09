import { isCI } from 'ci-info';
import type { Argv } from 'yargs';
import type { ParseCwd } from 'parse-cwd';
import type { Barrel } from '../lib/barrel.js';
import type { ConsoleLog } from '../lib/dependencies.js';
import type { BarrelCommandInput, Command } from './lib/types.js';

interface BarrelCommandExtendedInput extends BarrelCommandInput {
    ci: boolean;
    dryRun: boolean;
}

/**
 * Main `barrel` command
 */
export class BarrelCommand implements Command<BarrelCommandExtendedInput> {
    public readonly command = ['$0', 'barrel'];
    public readonly describe = 'Write index.ts barrel files';

    readonly #barrel: Barrel;
    readonly #logger: ConsoleLog;
    readonly #parseCwd: ParseCwd;

    public constructor(barrel: Barrel, logger: ConsoleLog, parseCwd: ParseCwd) {
        this.#barrel = barrel;
        this.#logger = logger;
        this.#parseCwd = parseCwd;

        this.handler = this.handler.bind(this);
    }

    public builder(yargs: Argv<BarrelCommandInput>): Argv<BarrelCommandExtendedInput> {
        return yargs
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
            .strict();
    }

    public async handler(options: BarrelCommandExtendedInput): Promise<void> {
        const cwd = await this.#parseCwd(options.cwd);

        const changed = await this.#barrel.barrelFiles({
            cwd,
            dryRun: options.ci || options.dryRun,
            ignore: options.ignore ?? [],
        });

        for (const change of changed) {
            this.#logger(change);
        }

        if (options.ci && changed.length > 0) {
            throw new Error('Files are not built');
        }
    }
}
