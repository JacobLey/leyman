import { populateFiles, type PopulationResponse } from 'populate-files';
import { loadFile } from './lib/loader.js';
import { normalizeParams } from './lib/normalize.js';
import type { RawOptions, RawParams } from './lib/types.js';

export type { FileContent, PopulateFileParams } from 'populate-files';

export const loadAndPopulateFiles = async (
    params: RawParams,
    options?: RawOptions
): Promise<PopulationResponse[]> => {
    const normalized = await normalizeParams(params, options);

    const files = await loadFile(normalized.filePath);

    return populateFiles(files, normalized.options);
};
