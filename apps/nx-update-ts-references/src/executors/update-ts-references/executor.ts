import Path from 'node:path';
import type { ExecutorContext } from '@nx/devkit';
import { isCI } from 'ci-info';
import type { IUpdateTsReferences } from '../../lib/update-ts-references.js';
import type { UpdateTsReferencesOptions } from './schema.js';

interface NormalizedOptions {
    packageRoot: string;
    tsConfig: string;
    check: boolean;
    dryRun: boolean;
    dependencies: string[];
}

/**
 * Factory for NX's UpdateTsReferences executor
 */
export class NxUpdateTsReferencesExecutorFactory {
    readonly #updateTsReferences: IUpdateTsReferences;

    public constructor(updateTsReferences: IUpdateTsReferences) {
        this.#updateTsReferences = updateTsReferences;
    }

    /**
     * Updates the `references` section of `tsconfig.json` for the given project.
     *
     * @param options - options passed from client
     * @param context - nx workspace context
     * @returns promise of completion
     */
    public async execute(
        options: UpdateTsReferencesOptions,
        context: ExecutorContext
    ): Promise<{ success: boolean }> {
        const normalized = NxUpdateTsReferencesExecutorFactory.#normalizeOptions(options, context);

        const updated = await this.#updateTsReferences({
            packageRoot: normalized.packageRoot,
            tsConfigPath: normalized.tsConfig,
            dependencyRootPaths: normalized.dependencies,
            dryRun: normalized.dryRun,
        });

        if (normalized.check && updated) {
            // eslint-disable-next-line no-console
            console.log('tsconfig.json is out of date');
            return { success: false };
        }

        return { success: true };
    }

    static #normalizeOptions(
        options: UpdateTsReferencesOptions,
        context: ExecutorContext
    ): NormalizedOptions {
        const projectName = context.projectName!;
        const packageRoot = Path.join(
            context.root,
            context.projectsConfigurations.projects[projectName]!.root
        );

        return {
            packageRoot,
            check: options.check ?? isCI,
            dryRun: options.dryRun ?? false,
            tsConfig: Path.join(packageRoot, 'tsconfig.json'),
            dependencies: context.projectGraph.dependencies[projectName]!.filter(
                dependency => context.projectsConfigurations.projects[dependency.target]
            ).map(dependency =>
                Path.join(
                    context.root,
                    context.projectsConfigurations.projects[dependency.target]!.root,
                    'tsconfig.json'
                )
            ),
        };
    }
}
