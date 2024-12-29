import { isCI } from 'ci-info';
import type { Argv } from 'yargs';
import type { LoadAndPopulateFiles } from 'load-populate-files';
import type { Command, LoadPopulateFilesCommandInput } from './lib/types.js';

interface LoadPopulateFilesCommandExtendedInput extends LoadPopulateFilesCommandInput {
    filePath: string;
    ci: boolean;
    dryRun: boolean;
}

/**
 * Main `load-populate-files` command
 */
export class LoadPopulateFilesCommand implements Command<LoadPopulateFilesCommandExtendedInput> {
    public readonly command = ['$0', 'load-populate-files'];
    public readonly describe = 'Read pre-generated content and write to file';

    readonly #loadPopulateFiles: LoadAndPopulateFiles;

    public constructor(loadPopulateFiles: LoadAndPopulateFiles) {
        this.#loadPopulateFiles = loadPopulateFiles;

        this.handler = this.handler.bind(this);
    }

    public builder(
        yargs: Argv<LoadPopulateFilesCommandInput>
    ): Argv<LoadPopulateFilesCommandExtendedInput> {
        return yargs
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
            })
            .strict();
    }

    public async handler(options: LoadPopulateFilesCommandExtendedInput): Promise<void> {
        await this.#loadPopulateFiles(
            {
                filePath: options.filePath,
            },
            {
                cwd: options.cwd,
                check: options.ci,
                dryRun: options.dryRun,
            }
        );
    }
}
