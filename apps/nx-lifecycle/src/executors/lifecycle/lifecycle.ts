import type * as fs from 'node:fs/promises';
import { deepEqual } from 'fast-equals';
import type { IsNxJson, IsProjectJson, NxJson, ProjectJson } from '#schemas';
import type { Logger } from './depedencies.js';
import type { NormalizedOptions, Normalizer } from './normalizer.js';
import type { NxAndProjectJsonProcessor } from './processor.js';
import type { LifecycleOptions } from './schema.js';
import type { SimpleExecutorContext } from './types.js';

interface LoadedJsonConfig<T> {
    name: string;
    path: string;
    data: T;
};
interface ProcessedJsonConfig<T> extends LoadedJsonConfig<T> {
    processed: T;
};

export class Lifecycle {

    public constructor(
        private readonly normalizer: Normalizer,
        private readonly readFile: typeof fs['readFile'],
        private readonly writeFile: typeof fs['writeFile'],
        private readonly processNxAndProjectJsons: NxAndProjectJsonProcessor,
        private readonly isNxJson: IsNxJson,
        private readonly isProjectJson: IsProjectJson,
        private readonly logger: Logger,
    ) {}

    async #loadJsonConfigs(
        {
            nxJsonPath,
            packageJsonPaths,
        }: NormalizedOptions
    ): Promise<{
        nxJson: LoadedJsonConfig<NxJson>;
        projectJsons: LoadedJsonConfig<ProjectJson>[];
    }> {

        const [
            rawNxJson,
            ...rawProjectJsons
        ] = await Promise.all([
            this.readFile(nxJsonPath, 'utf8'),
            ...packageJsonPaths.map(async ({ name, path }) => ({
                name,
                path,
                rawData: await this.readFile(path, 'utf8'),
            })),
        ]);

        const parsedNxJson = JSON.parse(rawNxJson);
        if (!this.isNxJson(parsedNxJson)) {
            throw new Error(`Failed to parse nx.json: ${JSON.stringify(this.isNxJson.errors!, null, 2)}`);
        }

        return {
            nxJson: {
                name: 'nx.json',
                path: nxJsonPath,
                data: parsedNxJson,
            },
            projectJsons: rawProjectJsons.map(({ name, path, rawData }) => {

                const data = JSON.parse(rawData);

                if (!this.isProjectJson(data)) {
                    throw new Error(`Failed to parse ${path}: ${JSON.stringify(this.isProjectJson.errors!, null, 2)}`);
                }

                return {
                    name,
                    path,
                    data,
                };
            }),
        };
    }

    async #saveJsonConfigs({ jsons, options }: {
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

        await Promise.all(filesToUpdate.map(async ({ path, processed }) => {
            this.logger.info(`Updating ${path}`);
            if (options.dryRun) {
                return;
            }
            return this.writeFile(path, JSON.stringify(processed, null, 2), 'utf8');
        }));
    }

    public async lifecycle (
        options: LifecycleOptions,
        context: SimpleExecutorContext
    ): Promise<{ success: boolean }> {

        const normalized = this.normalizer.normalizeOptions(options, context);

        const { nxJson, projectJsons } = await this.#loadJsonConfigs(normalized);

        const {
            processedNxJson,
            processedProjectJsons,
        } = this.processNxAndProjectJsons({
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

        return { success: true };
    };
}
