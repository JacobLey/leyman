import type {
    PopulateFileParams,
    PopulationResponse,
    PopulationResponseUpdated,
    RawOptions,
} from './lib/lib/types.js';
import { readdir, rm } from 'node:fs/promises';
import Path from 'node:path';
import { formatErrorMessage } from './lib/lib/errors.js';
import { normalizeFileParams, normalizeFilesParams } from './lib/normalize.js';
import { internalPopulateFile } from './lib/populate-file.js';

export type PopulateFile = (
    params: PopulateFileParams,
    options: RawOptions
) => Promise<PopulationResponse>;

export type PopulateFiles = (
    params: PopulateFileParams[],
    options: RawOptions
) => Promise<PopulationResponse[]>;

export const populateFile: PopulateFile = async (params, options) => {
    const normalized = await normalizeFileParams(params, options);
    return internalPopulateFile(normalized);
};

export const populateFiles: PopulateFiles = async (params, options) => {
    const { files, check, dryRun, clean, targetDir } = await normalizeFilesParams(params, options);

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

    if (clean) {
        const generatedPaths = new Set(files.map(f => f.filePath));

        const entries = await readdir(targetDir, {
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
                await Promise.all(stalePaths.map(async p => rm(p)));
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
};
