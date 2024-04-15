import { join } from 'node:path';
import type { LifecycleOptions } from './schema.js';
import type { SimpleExecutorContext } from './types.js';

export interface NormalizedOptions {
    check: boolean;
    dryRun: boolean;
    nxJsonPath: string;
    packageJsonPaths: { name: string; path: string }[];
    stages: NonNullable<LifecycleOptions['stages']>;
    targets: NonNullable<LifecycleOptions['targets']>;
}

/**
 * Standardizes the options passed to this executor,
 * based on input, reasonable defaults, and project state.
 */
export class Normalizer {
    readonly #isCI: boolean;
    public constructor(isCI: boolean) {
        this.#isCI = isCI;
    }

    public normalizeOptions(
        options: LifecycleOptions,
        context: SimpleExecutorContext
    ): NormalizedOptions {
        return {
            check: options.check ?? this.#isCI,
            dryRun: options.dryRun ?? false,
            nxJsonPath: join(context.root, 'nx.json'),
            packageJsonPaths: Object.values(context.projectsConfigurations!.projects).map(
                projectConfig => ({
                    name: projectConfig.name!,
                    path: join(context.root, projectConfig.root, 'project.json'),
                })
            ),
            stages: options.stages ?? {},
            targets: options.targets ?? {},
        };
    }
}
