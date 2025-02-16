import type { readFile as ReadFile } from 'node:fs/promises';
import Path from 'node:path';
import commentJson from 'comment-json';
import type { TextFormatter } from 'npm-format-file';
import type { PopulateFile } from 'npm-populate-files';
import { identifier } from 'haywire';
import { isTsConfig, type TsConfig } from './tsconfig-validator.js';

/**
 * Updates the `references` section of `tsconfig.json` for the given project.
 *
 * @param params - required parameters
 * @returns boolean promise, if true means file was updated
 */
export type IUpdateTsReferences = (params: {
    /**
     * List of paths to root of dependencies
     */
    dependencyRootPaths: string[];
    /**
     * Path to tsconfig.json file
     */
    tsConfigPath: string;
    /**
     * If true, will not actually write updated file
     */
    dryRun: boolean;
}) => Promise<boolean>;
export const updateTsReferencesId = identifier<IUpdateTsReferences>();

interface TsConfigFile {
    path: string;
    json: TsConfig;
}

/**
 * Factory for UpdateTsReferences
 */
export class UpdateTsReferencesFactory {
    readonly #readFile: typeof ReadFile;
    readonly #formatText: TextFormatter;
    readonly #populateFile: PopulateFile;

    public readonly updateTsReferences: IUpdateTsReferences;

    public constructor(
        readFile: typeof ReadFile,
        formatText: TextFormatter,
        populateFile: PopulateFile
    ) {
        this.#readFile = readFile;
        this.#formatText = formatText;
        this.#populateFile = populateFile;

        this.updateTsReferences = this.#updateTsReferences.bind(this);
    }

    async #updateTsReferences({
        dependencyRootPaths,
        tsConfigPath,
        dryRun,
    }: Parameters<IUpdateTsReferences>[0]): Promise<boolean> {
        const [packageTsConfig, ...dependencyTsConfigs] = await Promise.all([
            this.#readTsConfigFile(tsConfigPath),
            ...dependencyRootPaths.map(async path => this.#safeReadTsConfig(path)),
        ]);

        packageTsConfig.json.references = dependencyTsConfigs
            .filter(ts => !!ts)
            .sort((a, b) => a.path.localeCompare(b.path))
            .map(({ path }) => ({
                path: UpdateTsReferencesFactory.#transformTsConfigPath(
                    Path.relative(Path.join(tsConfigPath, '..'), path)
                ),
            }));

        const dataToWrite = await this.#formatText(
            commentJson.stringify(packageTsConfig.json, null, 2),
            {
                ext: '.json',
            }
        );

        const { updated } = await this.#populateFile(
            {
                filePath: tsConfigPath,
                content: dataToWrite,
            },
            {
                dryRun,
                check: false,
            }
        );
        return updated;
    }

    async #readTsConfigFile(path: string): Promise<TsConfigFile> {
        const rawData = await this.#readFile(path, 'utf8');

        const json = commentJson.parse(rawData);

        if (isTsConfig(json)) {
            return {
                path,
                json,
            };
        }
        throw new Error('tsconfig.json did not contain expected data');
    }

    async #safeReadTsConfig(path: string): Promise<TsConfigFile | null> {
        try {
            return await this.#readTsConfigFile(path);
        } catch {
            return null;
        }
    }

    static #transformTsConfigPath(path: string): string {
        if (Path.basename(path) === 'tsconfig.json') {
            return Path.dirname(path);
        }
        return path;
    }
}
