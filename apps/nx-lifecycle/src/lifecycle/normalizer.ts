import type { LifecycleOptions, LifecycleOptionsOrConfig } from './schema.js';
import type { NxContext } from './types.js';
import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { isCI } from 'ci-info';
import { parseCwd } from 'parse-cwd';
import { isLifecycleOptions } from './schema.js';

export interface NormalizedOptions {
    check: boolean;
    dryRun: boolean;
    nxJsonPath: string;
    packageJsonPaths: { name: string; path: string }[];
    stages: LifecycleOptions['stages'];
    bindings: LifecycleOptions['bindings'];
}

/**
 * Options passed directly, or loaded from a config file.
 *
 * @param options - options, or where to load them from
 * @returns stages and bindings, with any options passed directly
 * @throws {Error} when the config file is invalid
 */
export const loadOptions = async (options: LifecycleOptionsOrConfig): Promise<LifecycleOptions> => {
    if ('stages' in options) {
        return options;
    }

    const cwd = await parseCwd(options.cwd);
    const configFile = Path.join(cwd, options.configFile ?? './lifecycle.json');

    const loadedConfig = await readFile(configFile, 'utf8');
    const parsedConfig: unknown = JSON.parse(loadedConfig);

    if (isLifecycleOptions(parsedConfig)) {
        return {
            ...parsedConfig,
            ...options,
        };
    }
    throw new Error(`Invalid config loaded from ${configFile}`);
};

/**
 * Standardizes the options passed to this executor,
 * based on input, reasonable defaults, and project state.
 *
 * @param options - options provided directly, or where to load them from
 * @param context - workspace root and projects
 * @returns options with defaults and file paths resolved
 */
export const normalizeOptions = async (
    options: LifecycleOptionsOrConfig,
    context: NxContext
): Promise<NormalizedOptions> => {
    const loadedOptions = await loadOptions(options);

    return {
        check: loadedOptions.check ?? isCI,
        dryRun: loadedOptions.dryRun ?? false,
        nxJsonPath: Path.join(context.root, 'nx.json'),
        packageJsonPaths: context.projects.map(project => ({
            name: project.name,
            path: Path.join(context.root, project.root, 'project.json'),
        })),
        stages: loadedOptions.stages,
        bindings: loadedOptions.bindings,
    };
};
