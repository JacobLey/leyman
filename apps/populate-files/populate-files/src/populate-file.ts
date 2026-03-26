import type { readdir, rm } from 'node:fs/promises';
import type {
    PopulateFileParams,
    PopulationResponse,
    PopulationResponseUpdated,
    RawOptions,
} from './lib/lib/types.js';
import type { Normalize } from './lib/normalize.js';
import type { InternalPopulateFile } from './lib/populate-file.js';
import Path from 'node:path';
import { formatErrorMessage } from './lib/lib/errors.js';

export type PopulateFile = (
    params: PopulateFileParams,
    options: RawOptions
) => Promise<PopulationResponse>;

export type PopulateFiles = (
    params: PopulateFileParams[],
    options: RawOptions
) => Promise<PopulationResponse[]>;

/**
 * Factory for public facing populate file.
 */
export class PopulateFileFactory {
    readonly #normalize: Normalize;
    readonly #internalPopulateFile: InternalPopulateFile;
    readonly #readdir: typeof readdir;
    readonly #rm: typeof rm;

    public readonly populateFile: PopulateFile;
    public readonly populateFiles: PopulateFiles;

    public constructor(
        normalize: Normalize,
        internalPopulateFile: InternalPopulateFile,
        readdirFn: typeof readdir,
        rmFn: typeof rm
    ) {
        this.#normalize = normalize;
        this.#internalPopulateFile = internalPopulateFile;
        this.#readdir = readdirFn;
        this.#rm = rmFn;

        this.populateFile = this.#populateFile.bind(this);
        this.populateFiles = this.#populateFiles.bind(this);
    }

    async #populateFile(
        params: PopulateFileParams,
        options: RawOptions
    ): Promise<PopulationResponse> {
        const normalized = await this.#normalize.normalizeFileParams(params, options);
        return this.#internalPopulateFile(normalized);
    }

    async #populateFiles(
        params: PopulateFileParams[],
        options: RawOptions
    ): Promise<PopulationResponse[]> {
        const { files, check, dryRun, clean, targetDir } =
            await this.#normalize.normalizeFilesParams(params, options);

        const populateResults = await Promise.all(
            files.map(async ({ filePath, content }) =>
                this.#internalPopulateFile({
                    filePath,
                    content,
                    dryRun: dryRun || check,
                    check: false,
                })
            )
        );

        if (check) {
            const writes = populateResults.filter(
                (result): result is PopulationResponseUpdated => result.updated
            );

            if (writes.length > 0) {
                throw new Error(writes.map(write => formatErrorMessage(write)).join(', '));
            }
        }

        if (clean) {
            const generatedPaths = new Set(files.map(f => f.filePath));

            const entries = await this.#readdir(targetDir, {
                recursive: true,
                withFileTypes: true,
            }).catch((err: unknown) => {
                if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
                    return [];
                }
                throw err;
            });

            const stalePaths = entries
                .filter(e => e.isFile())
                .map(e => Path.join(e.parentPath, e.name))
                .filter(p => !generatedPaths.has(p));

            if (stalePaths.length > 0) {
                if (check) {
                    throw new Error(
                        stalePaths
                            .map(filePath => formatErrorMessage({ filePath, reason: 'stale-file' }))
                            .join(', ')
                    );
                }

                if (!dryRun) {
                    await Promise.all(stalePaths.map(async p => this.#rm(p)));
                }

                return [
                    ...populateResults,
                    ...stalePaths.map(
                        (filePath): PopulationResponseUpdated => ({
                            filePath,
                            updated: true,
                            reason: 'stale-file',
                        })
                    ),
                ];
            }
        }

        return populateResults;
    }
}
