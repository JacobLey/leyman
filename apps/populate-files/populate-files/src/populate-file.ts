import type {
    PopulateFileParams,
    PopulationResponse,
    PopulationResponseUpdated,
    RawOptions,
} from './lib/lib/types.js';
import type { Normalize } from './lib/normalize.js';
import type { InternalPopulateFile } from './lib/populate-file.js';
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

    public readonly populateFile: PopulateFile;
    public readonly populateFiles: PopulateFiles;

    public constructor(normalize: Normalize, internalPopulateFile: InternalPopulateFile) {
        this.#normalize = normalize;
        this.#internalPopulateFile = internalPopulateFile;

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
        const { files, check, dryRun } = await this.#normalize.normalizeFilesParams(
            params,
            options
        );

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

        return populateResults;
    }
}
