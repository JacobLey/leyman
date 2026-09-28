import type { PopulationResponse } from 'populate-files';
import type { RawOptions, RawParams } from './types.js';
import { populateFiles } from 'populate-files';
import { loadFile } from './loader.js';
import { normalizeParams } from './normalize.js';

export type LoadAndPopulateFiles = (
    params: RawParams,
    options?: RawOptions
) => Promise<PopulationResponse[]>;

export const loadAndPopulateFiles: LoadAndPopulateFiles = async (params, options = {}) => {
    const normalized = await normalizeParams(params, options);

    const files = await loadFile(normalized.filePath);

    return populateFiles(files, normalized.options);
};
