import type { NxJson, ProjectJson } from '#schemas';
import type { NormalizedOptions } from './normalizer.js';
import type { LifecycleOptionsOrConfig } from './schema.js';
import type { NxContext } from './types.js';
import { readFile, writeFile } from 'node:fs/promises';
import { deepEqual } from 'fast-equals';
import { formatFiles } from 'format-file';
import { assertNxJson, assertProjectJson } from '#schemas';
import { normalizeOptions } from './normalizer.js';
import { processNxAndProjectJsons } from './processor.js';

interface LoadedJsonConfig<T> {
    name: string;
    path: string;
    data: T;
}
interface ProcessedJsonConfig<T> extends LoadedJsonConfig<T> {
    processed: T;
}

const loadJsonConfigs = async ({
    nxJsonPath,
    packageJsonPaths,
}: NormalizedOptions): Promise<{
    nxJson: LoadedJsonConfig<NxJson>;
    projectJsons: LoadedJsonConfig<ProjectJson>[];
}> => {
    const [rawNxJson, ...rawProjectJsons] = await Promise.all([
        readFile(nxJsonPath, 'utf8'),
        ...packageJsonPaths.map(async ({ name, path }) => ({
            name,
            path,
            rawData: await readFile(path, 'utf8'),
        })),
    ]);

    const parsedNxJson: unknown = JSON.parse(rawNxJson);
    try {
        assertNxJson(parsedNxJson);
    } catch (err) {
        throw new Error('Failed to parse nx.json', { cause: err });
    }

    return {
        nxJson: {
            name: 'nx.json',
            path: nxJsonPath,
            data: parsedNxJson,
        },
        projectJsons: rawProjectJsons.map(({ name, path, rawData }) => {
            const data: unknown = JSON.parse(rawData);
            try {
                assertProjectJson(data);
            } catch (err) {
                throw new Error(`Failed to parse ${path}`, { cause: err });
            }

            return {
                name,
                path,
                data,
            };
        }),
    };
};

/**
 * A binding that no project declares is usually a typo.
 * Only a warning, as targets inferred by Nx plugins are not declared in `project.json`.
 *
 * @param bindings - target names mapped to their hooks
 * @param projectJsons - loaded project configs
 */
const warnUndeclaredBindings = (
    bindings: NormalizedOptions['bindings'],
    projectJsons: ProjectJson[]
): void => {
    const declaredTargets = new Set(
        projectJsons.flatMap(projectJson => Object.keys(projectJson.targets ?? {}))
    );
    for (const targetName of Object.keys(bindings)) {
        if (!declaredTargets.has(targetName)) {
            // eslint-disable-next-line no-console
            console.warn(
                `Bound target ${targetName} is not declared in any project.json. Is it a typo?`
            );
        }
    }
};

const saveJsonConfigs = async ({
    jsons,
    options,
}: {
    jsons: ProcessedJsonConfig<unknown>[];
    options: NormalizedOptions;
}): Promise<void> => {
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

    for (const { path } of filesToUpdate) {
        // eslint-disable-next-line no-console
        console.info(`Updating ${path}`);
    }
    if (options.dryRun) {
        return;
    }

    await Promise.all(
        filesToUpdate.map(async ({ path, processed }) =>
            writeFile(path, JSON.stringify(processed), 'utf8')
        )
    );
    await formatFiles(filesToUpdate.map(file => file.path));
};

/**
 * Main logic for lifecycle file management.
 *
 * Loads the `nx.json` + `project.json`s for all projects,
 * calculates the new targets and dependencies,
 * and re-writes files as appropriate.
 *
 * @param options - options provided directly, or where to load them from
 * @param context - workspace root and projects
 */
export const lifecycleInternal = async (
    options: LifecycleOptionsOrConfig,
    context: NxContext
): Promise<void> => {
    const normalized = await normalizeOptions(options, context);

    const { nxJson, projectJsons } = await loadJsonConfigs(normalized);

    warnUndeclaredBindings(
        normalized.bindings,
        projectJsons.map(({ data }) => data)
    );

    const { processedNxJson, processedProjectJsons } = processNxAndProjectJsons({
        nxJson: nxJson.data,
        projectJsons: projectJsons.map(({ data }) => data),
        options: normalized,
    });

    await saveJsonConfigs({
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
};
