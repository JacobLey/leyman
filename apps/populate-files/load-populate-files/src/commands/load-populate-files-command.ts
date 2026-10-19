import type { Argv } from 'yargs';
import type { Command, LoadPopulateFilesCommandInput } from './lib/types.js';
import { isCI } from 'ci-info';
import { bind } from 'haywire';
import { loadAndPopulateFiles } from '../lib/load-populate-files.js';
import { commandId } from './lib/types.js';

interface LoadPopulateFilesCommandExtendedInput extends LoadPopulateFilesCommandInput {
    filePath: string;
    ci: boolean;
    dryRun: boolean;
    clean: boolean;
    force: boolean;
    manifest: string | undefined;
}

/**
 * Main `load-populate-files` command
 */
export const loadPopulateFilesCommand: Command<LoadPopulateFilesCommandExtendedInput> = {
    command: ['$0', 'load-populate-files'],
    describe: 'Read pre-generated content and write to file',
    builder: (
        yargs: Argv<LoadPopulateFilesCommandInput>
    ): Argv<LoadPopulateFilesCommandExtendedInput> =>
        yargs
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
    handler: async options => {
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
    },
};

export const loadPopulateFilesCommandBinding = bind(commandId).withInstance(cli =>
    cli.command(loadPopulateFilesCommand)
);
