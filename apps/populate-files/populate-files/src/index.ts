import { normalizeFileParams, normalizeFilesParams } from './lib/normalize.js';
import { formatErrorMessage, internalPopulateFile } from './lib/populate-file.js';
import type {
    PopulateFileParams,
    PopulationResponse,
    PopulationResponseUpdated,
    RawOptions,
} from './lib/types.js';

export type {
    FileContent,
    PopulateFileParams,
    PopulationResponse,
} from './lib/types.js';

export type PopulateFile = (
    params: PopulateFileParams,
    options: RawOptions
) => Promise<PopulationResponse>;
export const populateFile: PopulateFile = async (
    params: PopulateFileParams,
    options: RawOptions
): Promise<PopulationResponse> => {
    const normalized = await normalizeFileParams(params, options);
    return internalPopulateFile(normalized);
};

export type PopulateFiles = (
    params: PopulateFileParams[],
    options: RawOptions
) => Promise<PopulationResponse[]>;
export const populateFiles: PopulateFiles = async (
    params: PopulateFileParams[],
    options: RawOptions
): Promise<PopulationResponse[]> => {
    const { files, check, dryRun } = await normalizeFilesParams(params, options);

    const populateResults = await Promise.all(
        files.map(async ({ filePath, content }) =>
            internalPopulateFile({
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
};
