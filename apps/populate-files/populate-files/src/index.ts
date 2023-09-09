import { normalizeFileParams, normalizeFilesParams } from './lib/normalize.js';
import { formatErrorMessage, internalPopulateFile } from './lib/populate-file.js';
import type { PopulateFileParams, PopulationResponse, PopulationResponseUpdated, RawOptions } from './lib/types.js';

export type { FileContent, PopulateFileParams, PopulationResponse } from './lib/types.js';

export const populateFile = async (
    params: PopulateFileParams,
    options: RawOptions
): Promise<PopulationResponse> => {
    const normalized = await normalizeFileParams(params, options);
    return internalPopulateFile(normalized);
};

export const populateFiles = async (
    params: PopulateFileParams[],
    options: RawOptions
): Promise<PopulationResponse[]> => {

    const { files, check, dryRun } = await normalizeFilesParams(params, options);

    const populateResults = await Promise.all(
        files.map(({ filePath, content }) => internalPopulateFile({
            filePath,
            content,
            dryRun: dryRun || check,
            check: false,
        }))
    );

    if (check) {
        const writes = populateResults.filter((result): result is PopulationResponseUpdated => result.updated === true);

        if (writes.length > 0) {
            throw new Error(writes.map(write => formatErrorMessage(write)).join(', '));
        }
    }

    return populateResults;
};

