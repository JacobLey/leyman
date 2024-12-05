import type { readFile as ReadFile } from 'node:fs/promises';
import Path from 'node:path';
import type { ProjectGraph } from '@nx/devkit';
import { isCI } from 'ci-info';
import type { AsyncSupplier } from 'npm-haywire';
import type { Argv } from 'yargs';
import { isProjectJson } from '../lib/project-json-validator.js';
import type { IUpdateTsReferences } from '../lib/update-ts-references.js';
import type { ParseCwd } from './lib/dependencies.js';
import type { Command, UpdateTsReferencesCommandInput } from './lib/types.js';

interface UpdateTsReferencesCommandExtendedInput extends UpdateTsReferencesCommandInput {
    ci: boolean;
    dryRun: boolean;
}

/**
 * Main `update-ts-references` command
 */
export class UpdateTsReferencesCommand implements Command<UpdateTsReferencesCommandExtendedInput> {
    public readonly command = ['$0', 'update-ts-references'];
    public readonly describe =
        "Write tsconfig.json's references field based on Nx detected dependencies";

    readonly #updateTsReferences: IUpdateTsReferences;
    readonly #parseCwd: ParseCwd;
    readonly #projectGraph: AsyncSupplier<ProjectGraph>;
    readonly #readFile: typeof ReadFile;

    public constructor(
        updateTsReferences: IUpdateTsReferences,
        parseCwd: ParseCwd,
        projectGraph: AsyncSupplier<ProjectGraph>,
        readFile: typeof ReadFile
    ) {
        this.#updateTsReferences = updateTsReferences;
        this.#parseCwd = parseCwd;
        this.#projectGraph = projectGraph;
        this.#readFile = readFile;

        this.handler = this.handler.bind(this);
    }

    public builder(
        yargs: Argv<UpdateTsReferencesCommandInput>
    ): Argv<UpdateTsReferencesCommandExtendedInput> {
        return yargs
            .options({
                ci: {
                    describe: 'Fail if file is not up to date. Implies --dry-run',
                    type: 'boolean',
                    default: isCI,
                    alias: 'check',
                },
                dryRun: {
                    describe: 'Do not write file',
                    type: 'boolean',
                    default: false,
                },
            })
            .strict();
    }

    public async handler(options: UpdateTsReferencesCommandExtendedInput): Promise<void> {
        const packageRoot = await this.#parseCwd(options.packageRoot);

        const dependencyRootPaths = await this.#getDependencyRootPaths(packageRoot);

        const changed = await this.#updateTsReferences({
            packageRoot,
            dependencyRootPaths,
            dryRun: options.ci || options.dryRun,
            tsConfigPath: Path.resolve(packageRoot, 'tsconfig.json'),
        });

        if (options.ci && changed) {
            throw new Error('tsconfig.json is not built');
        }
    }

    async #getDependencyRootPaths(packageRoot: string): Promise<string[]> {
        const [projectGraph, rawProjectJson] = await Promise.all([
            this.#projectGraph(),
            this.#readFile(Path.join(packageRoot, 'project.json'), 'utf8'),
        ]);

        const projectJson: unknown = JSON.parse(rawProjectJson);

        if (!isProjectJson(projectJson)) {
            throw new Error('Cannot parse project.json name');
        }

        const { root } = projectGraph.nodes[projectJson.name]!.data;

        return projectGraph.dependencies[projectJson.name]!.map(
            ({ target }) => projectGraph.nodes[target]
        )
            .filter(node => !!node)
            .map(node => Path.relative(root, node.data.root))
            .map(path => Path.resolve(packageRoot, path, 'tsconfig.json'));
    }
}
