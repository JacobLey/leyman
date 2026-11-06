import type {
    CreateNodes,
    CreateNodesContext,
    CreateNodesResult,
    TargetConfiguration,
} from '@nx/devkit';
import type { NxPluginOptions } from './options.js';
import Path from 'node:path';
import { inferTargets } from './infer.js';
import { resolveOptions } from './options.js';
import { loadProjects } from './projects.js';
import { assertOptions } from './schema.js';
import { namedInputs, targetConfigurations } from './targets.js';

/**
 * Name of the plugin, as Nx reports it.
 */
export const name = '@leyman/nx-plugin';

/**
 * Infers the targets of each project from its files: how they run and what they hash, but not when, which is
 * nx-lifecycle's (or the workspace's `dependsOn`) to say.
 *
 * @param projectJsonPaths - every `project.json` of the workspace, relative to its root
 * @param options - plugin options from `nx.json`
 * @param context - Nx's context
 * @param context.workspaceRoot - absolute path the `project.json` paths are relative to
 * @returns each project's named inputs and targets, by its `project.json`
 * @rejects {Error} when the options are invalid
 */
const createTypescriptNodes = async (
    projectJsonPaths: readonly string[],
    options: NxPluginOptions | undefined,
    { workspaceRoot }: Pick<CreateNodesContext, 'workspaceRoot'>
): Promise<[string, CreateNodesResult][]> => {
    assertOptions(options ?? {}, 'nx.json');
    const resolved = resolveOptions(options);
    const configurations = targetConfigurations(resolved);
    const projectNamedInputs = namedInputs(resolved);

    const projects = await loadProjects(
        workspaceRoot,
        projectJsonPaths.map(path => Path.dirname(path))
    );
    return projects.map(project => {
        const targets: Record<string, TargetConfiguration> = {};
        for (const target of inferTargets(project, resolved)) {
            const { name: targetName } = resolved.targets[target] as { name: string };
            targets[targetName] = configurations[target];
        }
        return [
            Path.join(project.root, 'project.json'),
            { projects: { [project.root]: { namedInputs: projectNamedInputs, targets } } },
        ];
    });
};

/**
 * The Nx plugin: infers targets for each project with a `project.json`. A `project.json` overrides any part of a
 * target, as Nx merges it over what plugins infer.
 */
// eslint-disable-next-line unicorn/no-non-function-verb-prefix -- Nx loads plugins by this export name
export const createNodes: CreateNodes<NxPluginOptions> = ['**/project.json', createTypescriptNodes];
