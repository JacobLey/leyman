import { resolve } from 'node:path';
import type { ExecutorContext } from '@nx/devkit';
import { loadAndPopulateFiles } from 'load-populate-files';
import type { PopulateFilesOptions } from './schema.js';

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
            console.error(error.message);
        } else {
            console.error('Unknown Error', error);
        }
        return { success: false };
    }
};
