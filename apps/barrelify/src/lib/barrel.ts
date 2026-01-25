import type { PopulateFile } from 'populate-files';
import type { ReadFile } from './dependencies.js';
import type { Glob } from './glob.js';
import Path from 'node:path';

/**
 * Core logic for barrelify.
 */
export class Barrel {
    readonly #readFile: ReadFile;
    readonly #populateFile: PopulateFile;
    readonly #glob: Glob;

    public constructor(readFile: ReadFile, populateFile: PopulateFile, glob: Glob) {
        this.#readFile = readFile;
        this.#populateFile = populateFile;
        this.#glob = glob;
    }

    /**
     * Update all barrel files in current working directory.
     *
     * Optionally ignore some files, and skip writes ("dry run").
     *
     * Returns list of all files that got updated.
     *
     * @param param - params
     * @param param.cwd - directory to search/update index files
     * @param param.dryRun - if true, skip writes
     * @param param.ignore - list of files/blobs to ignore when searching for index files
     * @returns list of all files that got updated
     */
    public async barrelFiles({
        cwd,
        dryRun,
        ignore,
    }: {
        cwd: string;
        dryRun: boolean;
        ignore: string[];
    }): Promise<string[]> {
        const indexFiles = await this.#glob.findIndexFiles({ dir: cwd, ignore });

        const mismatchFiles: string[] = [];

        await Promise.all(
            indexFiles.map(async file => {
                const filePath = Path.resolve(cwd, file);

                const wasUpdated = await this.barrelFile({ dryRun, filePath });

                if (wasUpdated) {
                    mismatchFiles.push(filePath);
                }
            })
        );

        return mismatchFiles;
    }

    /**
     * Barrel a single file.
     * Returns true if file was out-of-sync.
     *
     * @param param - params
     * @param param.dryRun - if true, do not actually write file
     * @param param.filePath - fully resolved path to file
     * @returns true if updated
     */
    public async barrelFile({
        dryRun,
        filePath,
    }: {
        dryRun: boolean;
        filePath: string;
    }): Promise<boolean> {
        const data = await this.#readFile(filePath, 'utf8');

        if (!data.startsWith('// AUTO-BARREL')) {
            return false;
        }

        const files = await this.#glob.findFilesForIndex(filePath);
        const existingTypes = Barrel.parseTypes(data);

        const barrel = Barrel.generateBarrelFile({ files, types: existingTypes });

        const { updated } = await this.#populateFile(
            {
                filePath,
                content: barrel,
            },
            {
                dryRun,
                check: false,
            }
        );
        return updated;
    }

    public static generateBarrelFile({
        files,
        types,
    }: {
        files: string[];
        types: Set<string>;
    }): string {
        return [
            // Idempotent
            '// AUTO-BARREL',
            '',
            ...files
                .map(file => {
                    const ext = Path.extname(file);
                    const base = Path.basename(file, ext);

                    return `${base}${ext.replace('t', 'j')}`;
                })
                .sort((a, b) => a.localeCompare(b, 'en'))
                .map(
                    filename =>
                        `export ${types.has(filename) ? 'type ' : ''}* from './${filename}';`
                ),
            '',
        ].join('\n');
    }

    public static parseTypes(file: string): Set<string> {
        const matches = file.matchAll(
            /^export type \* from '\.\/(?<filename>.+)\.(?<extension>[cm]?[tj]s)';$/gmu
        );

        const result = new Set<string>();

        for (const match of matches) {
            const { filename, extension } = match.groups!;

            result.add(`${filename!}.${extension!}`);
            result.add(`${filename!}.${extension!.replace('j', 't')}`);
            result.add(`${filename!}.${extension!.replace('t', 'j')}`);
        }

        return result;
    }
}
