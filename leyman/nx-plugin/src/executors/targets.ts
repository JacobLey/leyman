import type { ExecutorContext } from '@nx/devkit';
import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { syncTargets } from '#internal/lib/sync.js';

/**
 * Where the plugin options are, and whether to only check them.
 */
export interface TargetsExecutorOptions {
    /**
     * Path of the file holding the plugin options, relative to the workspace root.
     */
    readonly config: string;
    /**
     * Fail rather than write when a file is out of date.
     *
     * @default true in CI (`CI` set to anything but `false` or `0`)
     */
    readonly check?: boolean;
}

/**
 * Whether the environment is CI, as `CI` says.
 *
 * @param ci - value of `CI`
 * @returns whether to check rather than write
 */
const isCi = (ci: string | undefined): boolean => !['', '0', 'false', undefined].includes(ci);

/**
 * Nx executor writing the plugin's named inputs and target defaults into `nx.json`, and the targets each project
 * gets into its `project.json`, from the options in a file.
 *
 * @param options - where the plugin options are, and whether to only check
 * @param context - Nx executor context
 * @returns success, as failures reject
 * @rejects {Error} when the options are invalid, or a file is out of date in `check` mode
 */
const targetsExecutor = async (
    options: TargetsExecutorOptions,
    context: Pick<ExecutorContext, 'projectsConfigurations' | 'root'>
): Promise<{ success: boolean }> => {
    const config = Path.join(context.root, options.config);
    const written = await syncTargets({
        root: context.root,
        projects: Object.entries(context.projectsConfigurations.projects).map(
            ([name, { root }]) => ({ name, root })
        ),
        options: JSON.parse(await readFile(config, 'utf8')),
        optionsSource: options.config,
        // eslint-disable-next-line n/no-process-env -- CI is told by the environment
        check: options.check ?? isCi(process.env.CI),
    });
    for (const path of written) {
        // eslint-disable-next-line no-console -- Reported to the terminal the executor runs in
        console.info(`Updated ${Path.relative(context.root, path)}`);
    }
    return { success: true };
};
export default targetsExecutor;
