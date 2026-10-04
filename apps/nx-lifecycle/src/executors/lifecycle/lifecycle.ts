import type { ExecutorContext } from '@nx/devkit';
import type { LifecycleOptionsOrConfig } from '../../lifecycle/schema.js';
import { lifecycleInternal } from '../../lifecycle/lifecycle-internal.js';

export type SimpleExecutorContext = Pick<ExecutorContext, 'projectsConfigurations' | 'root'>;

/**
 * Nx executor for lifecycle file management.
 *
 * Loads the `nx.json` + `project.json`s for all projects,
 * calculates the new targets and dependencies,
 * and re-writes files as appropriate.
 *
 * @param options - options provided directly, or where to load them from
 * @param context - Nx executor context
 * @returns success, as failures throw
 */
export const lifecycle = async (
    options: LifecycleOptionsOrConfig,
    context: SimpleExecutorContext
): Promise<{ success: boolean }> => {
    await lifecycleInternal(options, {
        root: context.root,
        projects: Object.values(context.projectsConfigurations.projects).map(projectConfig => ({
            name: projectConfig.name!,
            root: projectConfig.root,
        })),
    });

    return { success: true };
};
