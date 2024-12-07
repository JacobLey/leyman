import Path from 'node:path';
import type { ExecutorContext } from '@nx/devkit';
import type { IUpdateTsReferences } from '../../lib/update-ts-references.js';
import type { ErrorLogger } from './lib/dependencies.js';
import type { UpdateTsReferencesOptions } from './schema.js';

interface NormalizedOptions {
    tsConfig: string;
    check: boolean;
    dryRun: boolean;
    dependencies: string[];
}

/**
 * Factory for NX's UpdateTsReferences executor
 */
export class NxUpdateTsReferencesExecutor {
    readonly #isCI: boolean;
    readonly #updateTsReferences: IUpdateTsReferences;
    readonly #logger: ErrorLogger;

    public constructor(
        isCI: boolean,
        updateTsReferences: IUpdateTsReferences,
        logger: ErrorLogger
    ) {
        this.#isCI = isCI;
        this.#updateTsReferences = updateTsReferences;
        this.#logger = logger;
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
        const normalized = this.#normalizeOptions(options, context);

        const updated = await this.#updateTsReferences({
            tsConfigPath: normalized.tsConfig,
            dependencyRootPaths: normalized.dependencies,
            dryRun: normalized.check || normalized.dryRun,
        });

        if (normalized.check && updated) {
            this.#logger('tsconfig.json is out of date');
            return { success: false };
        }

        return { success: true };
    }

    #normalizeOptions(
        options: UpdateTsReferencesOptions,
        context: ExecutorContext
    ): NormalizedOptions {
        const projectName = context.projectName!;
        const packageRoot = Path.join(
            context.root,
            context.projectsConfigurations.projects[projectName]!.root
        );

        return {
            check: options.check ?? this.#isCI,
            dryRun: options.dryRun ?? false,
            tsConfig: Path.join(packageRoot, 'tsconfig.json'),
            dependencies: context.projectGraph.dependencies[projectName]!.map(
                dependency => context.projectsConfigurations.projects[dependency.target]
            )
                .filter(config => !!config)
                .map(config => Path.join(context.root, config.root, 'tsconfig.json')),
        };
    }
}
