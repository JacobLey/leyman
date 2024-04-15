import { readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { ExecutorContext } from '@nx/devkit';
import { isCI } from 'ci-info';
import commentJson from 'comment-json';
import { formatText } from 'npm-format-file';
import type { UpdateTsReferencesOptions } from './schema.js';
import { isTsConfig, type TsConfig } from './tsconfig-validator.js';

interface NormalizedOptions {
    packageRoot: string;
    tsConfig: string;
    check: boolean;
    dryRun: boolean;
    dependencies: string[];
}

const normalizeOptions = (
    options: UpdateTsReferencesOptions,
    context: ExecutorContext
): NormalizedOptions => {
    const projectName = context.projectName!;
    const packageRoot = join(
        context.root,
        context.projectsConfigurations!.projects[projectName]!.root
    );

    return {
        check: options.check ?? isCI,
        dryRun: options.dryRun ?? false,
        packageRoot,
        tsConfig: join(packageRoot, 'tsconfig.json'),
        dependencies: context
            .projectGraph!.dependencies[projectName]!.filter(
                dependency => context.projectsConfigurations!.projects[dependency.target]
            )
            .map(dependency =>
                join(
                    context.root,
                    context.projectsConfigurations!.projects[dependency.target]!.root,
                    'tsconfig.json'
                )
            ),
    };
};

interface TsConfigFile {
    path: string;
    rawData: string;
    json: TsConfig;
}

const readTsConfigFile = async (path: string): Promise<TsConfigFile> => {
    const rawData = await readFile(path, 'utf8');

    const json = commentJson.parse(rawData);

    if (isTsConfig(json)) {
        return {
            path,
            rawData,
            json,
        };
    }
    throw new Error('tsconfig.json did not contain expected data');
};

const safeReadTsConfig = async (path: string): Promise<TsConfigFile | null> => {
    try {
        return await readTsConfigFile(path);
    } catch {
        return null;
    }
};

/**
 * Updates the `references` section of `tsconfig.json` for the given project.
 *
 * @param options - options passed from client
 * @param context - nx workspace context
 * @returns promise of completion
 */
export default async (
    options: UpdateTsReferencesOptions,
    context: ExecutorContext
): Promise<{ success: boolean }> => {
    const normalized = normalizeOptions(options, context);

    const [packageTsConfig, ...dependencyTsConfigs] = await Promise.all([
        readTsConfigFile(normalized.tsConfig),
        ...normalized.dependencies.map(async path => safeReadTsConfig(path)),
    ]);

    const foundDependencies = dependencyTsConfigs.filter(
        (ts): ts is NonNullable<typeof ts> => !!ts
    );

    packageTsConfig.json.references = foundDependencies
        .sort((a, b) => a.path.localeCompare(b.path))
        .map(({ path }) => ({
            path: relative(normalized.packageRoot, join(path, '..')),
        }));

    const dataToWrite = await formatText(commentJson.stringify(packageTsConfig.json, null, 2), {
        ext: '.json',
    });

    if (dataToWrite === packageTsConfig.rawData) {
        return { success: true };
    }

    if (normalized.check) {
        // eslint-disable-next-line no-console
        console.log('tsconfig.json is out of date');
        return { success: false };
    }
    if (!normalized.dryRun) {
        await writeFile(normalized.tsConfig, dataToWrite, 'utf8');
    }

    return { success: true };
};
