import { resolve } from 'node:path';
import type { ExecutorContext } from '@nx/devkit';
import { loadAndPopulateFiles } from 'load-populate-files';
import type { PopulateFilesOptions } from './schema.js';

/**
 * Loads content from specified file, and populates other file with generated content.
 *
 * @param options - options provided by user
 * @param context - nx workspace context
 * @returns success
 */
export default async (
    options: PopulateFilesOptions,
    context: ExecutorContext
): Promise<{ success: boolean }> => {
    try {
        await loadAndPopulateFiles(
            {
                filePath: resolve(context.root, options.filePath),
            },
            {
                cwd: resolve(
                    context.root,
                    options.cwd ??
                        context.projectsConfigurations!.projects[
                            context.projectName!
                        ]!.root
                ),
                check: options.check,
                dryRun: options.dryRun,
            }
        );

        return { success: true };
    } catch (error) {
        if (error instanceof Error) {
            // eslint-disable-next-line no-console
            console.error(error.message);
        } else {
            // eslint-disable-next-line no-console
            console.error('Unknown Error', error);
        }
        return { success: false };
    }
};
