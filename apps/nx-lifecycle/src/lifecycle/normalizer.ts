import type { readFile as ReadFile } from 'node:fs/promises';
import Path from 'node:path';
import type { ParseCwd } from 'parse-cwd';
import {
    isLifecycleOptions,
    type LifecycleOptions,
    type LifecycleOptionsOrConfig,
} from './schema.js';
import type { NxContext } from './types.js';

export interface NormalizedOptions {
    check: boolean;
    dryRun: boolean;
    nxJsonPath: string;
    packageJsonPaths: { name: string; path: string }[];
    stages: LifecycleOptions['stages'];
    bindings: LifecycleOptions['bindings'];
}

/**
 * Standardizes the options passed to this executor,
 * based on input, reasonable defaults, and project state.
 */
export class Normalizer {
    readonly #isCI: () => boolean;
    readonly #parseCwd: ParseCwd;
    readonly #readFile: typeof ReadFile;

    public constructor(isCI: () => boolean, parseCwd: ParseCwd, readFile: typeof ReadFile) {
        this.#isCI = isCI;
        this.#parseCwd = parseCwd;
        this.#readFile = readFile;
    }

    public async normalizeOptions(
        options: LifecycleOptionsOrConfig,
        context: NxContext
    ): Promise<NormalizedOptions> {
        const loadedOptions = await this.#loadOptions(options);

        return {
            check: loadedOptions.check ?? this.#isCI(),
            dryRun: loadedOptions.dryRun ?? false,
            nxJsonPath: Path.join(context.root, 'nx.json'),
            packageJsonPaths: context.projects.map(project => ({
                name: project.name,
                path: Path.join(context.root, project.root, 'project.json'),
            })),
            stages: loadedOptions.stages,
            bindings: loadedOptions.bindings,
        };
    }

    async #loadOptions(options: LifecycleOptionsOrConfig): Promise<LifecycleOptions> {
        if ('stages' in options) {
            return options;
        }

        const cwd = await this.#parseCwd(options.cwd);
        const configFile = Path.join(cwd, options.configFile ?? './lifecycle.json');

        const loadedConfig = await this.#readFile(configFile, 'utf8');
        const parsedConfig: unknown = JSON.parse(loadedConfig);

        if (isLifecycleOptions(parsedConfig)) {
            return {
                ...parsedConfig,
                ...options,
            };
        }
        throw new Error(`Invalid config loaded from ${configFile}`);
    }
}
