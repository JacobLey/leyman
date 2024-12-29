import type { ExecutorContext } from '@nx/devkit';
import type { ILifecycleInternal } from '../../lifecycle/lifecycle-internal.js';
import type { LifecycleOptionsOrConfig } from '../../lifecycle/schema.js';

export type SimpleExecutorContext = Pick<ExecutorContext, 'projectsConfigurations' | 'root'>;

/**
 * Main logic for lifecycle file management.
 *
 * Loads the `nx.json` + `project.json`s for all projects,
 * calculates the new targets and dependencies,
 * and re-writes files as appropriate.
 */
export class Lifecycle {
    readonly #lifecycleInternal: ILifecycleInternal;

    public readonly lifecycle: (
        options: LifecycleOptionsOrConfig,
        context: SimpleExecutorContext
    ) => Promise<{ success: boolean }>;

    public constructor(lifecycleInternal: ILifecycleInternal) {
        this.#lifecycleInternal = lifecycleInternal;

        this.lifecycle = this.#lifecycle.bind(this);
    }

    async #lifecycle(
        options: LifecycleOptionsOrConfig,
        context: SimpleExecutorContext
    ): Promise<{ success: boolean }> {
        await this.#lifecycleInternal(options, {
            root: context.root,
            projects: Object.values(context.projectsConfigurations.projects).map(projectConfig => ({
                name: projectConfig.name!,
                root: projectConfig.root,
            })),
        });

        return { success: true };
    }
}
