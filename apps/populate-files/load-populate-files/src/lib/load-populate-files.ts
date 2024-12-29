import type { PopulateFiles, PopulationResponse } from 'populate-files';
import type { LoadFile } from './loader.js';
import type { NormalizeParams } from './normalize.js';
import type { RawOptions, RawParams } from './types.js';

export type LoadAndPopulateFiles = (
    params: RawParams,
    options?: RawOptions
) => Promise<PopulationResponse[]>;

/**
 * Factory for generating primary `loadAndPopulateFiles` function
 */
export class LoadPopulateFilesFactory {
    readonly #normalizeParams: NormalizeParams;
    readonly #loadFile: LoadFile;
    readonly #populateFiles: PopulateFiles;

    public readonly loadAndPopulateFiles: LoadAndPopulateFiles;

    public constructor(
        normalizeParams: NormalizeParams,
        loadFile: LoadFile,
        populateFiles: PopulateFiles
    ) {
        this.#normalizeParams = normalizeParams;
        this.#loadFile = loadFile;
        this.#populateFiles = populateFiles;

        this.loadAndPopulateFiles = this.#loadAndPopulateFiles.bind(this);
    }

    async #loadAndPopulateFiles(
        params: RawParams,
        options: RawOptions = {}
    ): Promise<PopulationResponse[]> {
        const normalized = await this.#normalizeParams(params, options);

        const files = await this.#loadFile(normalized.filePath);

        return this.#populateFiles(files, normalized.options);
    }
}
