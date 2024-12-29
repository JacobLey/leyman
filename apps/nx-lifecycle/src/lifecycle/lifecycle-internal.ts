import type { readFile as ReadFile, writeFile as WriteFile } from 'node:fs/promises';
import { deepEqual } from 'fast-equals';
import type { FilesFormatter } from 'format-file';
import type { IsNxJson, IsProjectJson, NxJson, ProjectJson } from '#schemas';
import type { Logger } from './depedencies.js';
import type { NormalizedOptions, Normalizer } from './normalizer.js';
import type { NxAndProjectJsonProcessor } from './processor.js';
import type { LifecycleOptionsOrConfig } from './schema.js';
import type { NxContext } from './types.js';

interface LoadedJsonConfig<T> {
    name: string;
    path: string;
    data: T;
}
interface ProcessedJsonConfig<T> extends LoadedJsonConfig<T> {
    processed: T;
}

export type ILifecycleInternal = (
    options: LifecycleOptionsOrConfig,
    context: NxContext
) => Promise<void>;

/**
 * Main logic for lifecycle file management.
 *
 * Loads the `nx.json` + `project.json`s for all projects,
 * calculates the new targets and dependencies,
 * and re-writes files as appropriate.
 */
export class LifecycleInternal {
    readonly #normalizer: Normalizer;
    readonly #readFile: typeof ReadFile;
    readonly #writeFile: typeof WriteFile;
    readonly #formatFiles: FilesFormatter;
    readonly #processNxAndProjectJsons: NxAndProjectJsonProcessor;
    readonly #isNxJson: IsNxJson;
    readonly #isProjectJson: IsProjectJson;
    readonly #logger: Logger;

    public readonly lifecycleInternal: ILifecycleInternal;

    public constructor(
        normalizer: Normalizer,
        readFile: typeof ReadFile,
        writeFile: typeof WriteFile,
        formatFiles: FilesFormatter,
        processNxAndProjectJsons: NxAndProjectJsonProcessor,
        isNxJson: IsNxJson,
        isProjectJson: IsProjectJson,
        logger: Logger
    ) {
        this.#normalizer = normalizer;
        this.#readFile = readFile;
        this.#writeFile = writeFile;
        this.#formatFiles = formatFiles;
        this.#processNxAndProjectJsons = processNxAndProjectJsons;
        this.#isNxJson = isNxJson;
        this.#isProjectJson = isProjectJson;
        this.#logger = logger;

        this.lifecycleInternal = this.#lifecycleInternal.bind(this);
    }

    async #lifecycleInternal(options: LifecycleOptionsOrConfig, context: NxContext): Promise<void> {
        const normalized = await this.#normalizer.normalizeOptions(options, context);

        const { nxJson, projectJsons } = await this.#loadJsonConfigs(normalized);

        const { processedNxJson, processedProjectJsons } = this.#processNxAndProjectJsons({
            nxJson: nxJson.data,
            projectJsons: projectJsons.map(({ data }) => data),
            options: normalized,
        });

        await this.#saveJsonConfigs({
            jsons: [
                {
                    ...nxJson,
                    processed: processedNxJson,
                },
                ...projectJsons.map((projectJson, i) => ({
                    ...projectJson,
                    processed: processedProjectJsons[i]!,
                })),
            ],
            options: normalized,
        });
    }

    async #loadJsonConfigs({ nxJsonPath, packageJsonPaths }: NormalizedOptions): Promise<{
        nxJson: LoadedJsonConfig<NxJson>;
        projectJsons: LoadedJsonConfig<ProjectJson>[];
    }> {
        const [rawNxJson, ...rawProjectJsons] = await Promise.all([
            this.#readFile(nxJsonPath, 'utf8'),
            ...packageJsonPaths.map(async ({ name, path }) => ({
                name,
                path,
                rawData: await this.#readFile(path, 'utf8'),
            })),
        ]);

        const parsedNxJson: unknown = JSON.parse(rawNxJson);
        if (!this.#isNxJson(parsedNxJson)) {
            throw new Error(
                `Failed to parse nx.json: ${JSON.stringify(this.#isNxJson.errors!, null, 2)}`
            );
        }

        return {
            nxJson: {
                name: 'nx.json',
                path: nxJsonPath,
                data: parsedNxJson,
            },
            projectJsons: rawProjectJsons.map(({ name, path, rawData }) => {
                const data: unknown = JSON.parse(rawData);

                if (!this.#isProjectJson(data)) {
                    throw new Error(
                        `Failed to parse ${path}: ${JSON.stringify(
                            this.#isProjectJson.errors!,
                            null,
                            2
                        )}`
                    );
                }

                return {
                    name,
                    path,
                    data,
                };
            }),
        };
    }

    async #saveJsonConfigs({
        jsons,
        options,
    }: {
        jsons: ProcessedJsonConfig<unknown>[];
        options: NormalizedOptions;
    }): Promise<void> {
        const filesToUpdate: {
            path: string;
            processed: unknown;
        }[] = [];

        for (const { path, data, processed } of jsons) {
            if (deepEqual(data, processed)) {
                continue;
            }
            if (options.check) {
                throw new Error(`File ${path} is not up to date`);
            }
            filesToUpdate.push({
                path,
                processed,
            });
        }

        await Promise.all(
            filesToUpdate.map(async ({ path, processed }) => {
                this.#logger.info(`Updating ${path}`);
                if (options.dryRun) {
                    return;
                }
                return this.#writeFile(path, JSON.stringify(processed), 'utf8');
            })
        );
        await this.#formatFiles(filesToUpdate.map(file => file.path));
    }
}
