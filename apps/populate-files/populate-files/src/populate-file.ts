import type { Dirent } from 'node:fs';
import type {
    NormalizedOptions,
    NormalizedParams,
    PopulateFileParams,
    PopulateOptions,
    PopulationResponse,
    PopulationResponseUpdated,
} from './lib/lib/types.js';
import type { ManifestEntries } from './lib/manifest.js';
import { readdir, rm } from 'node:fs/promises';
import Path from 'node:path';
import { stringToUint8Array } from 'uint8array-extras';
import { hasCode } from 'unknown-error';
import { PopulateFilesCheckError } from './lib/lib/errors.js';
import { safeLoadFile } from './lib/loader.js';
import { assertOwnedByManifest, entryFor, loadManifest, renderManifest } from './lib/manifest.js';
import { normalizeFileParams, normalizeFilesParams } from './lib/normalize.js';
import { internalPopulateFile } from './lib/populate-file.js';

/**
 * @import { PopulateFilesOwnershipError } from './lib/lib/errors.js'
 */

/**
 * Write one file, or with `check` fail if it would change.
 *
 * Resolves to whether the file was (or, with `dryRun`, would be) written, with an absolute `filePath`.
 *
 * @rejects {PopulateFilesCheckError} `File <path> not up to date. Reason: <reason>` with `check`, when the file would be
 *   created or changed
 * @rejects {PopulateFilesOwnershipError} if a signed or manifest-tracked file can't be overwritten without losing edits (unless `force`)
 * @rejects {TypeError} if `signed` content isn't a string
 */
export type PopulateFile = (
    params: PopulateFileParams,
    options?: PopulateOptions
) => Promise<PopulationResponse>;

/**
 * Write several files in parallel. Each `filePath` must be unique.
 *
 * Resolves to one result per file, then one for the manifest, then one per file removed by `clean`.
 * With `check`, every file is computed first and one `Error` lists everything out of date.
 *
 * @rejects {PopulateFilesCheckError} `File <path> not up to date. Reason: <reason>` with `check`, joined with `, ` per
 *   file
 * @rejects {PopulateFilesOwnershipError} as for {@link PopulateFile}, thrown as soon as found
 * @rejects {TypeError} if two files resolve to the same path, or `signed` content isn't a string
 */
export type PopulateFiles = (
    params: readonly PopulateFileParams[],
    options?: PopulateOptions
) => Promise<PopulationResponse[]>;

/**
 * Write a manifest like any other generated file. It is always ours, so never checked for edits.
 *
 * @param params - manifest to write
 * @param params.manifestPath - absolute path
 * @param params.entries - entries by absolute path
 * @param params.check - fail if the manifest would change
 * @param params.dryRun - do not write
 * @returns whether the manifest was (or would be) updated
 */
const populateManifest = async ({
    manifestPath,
    entries,
    check,
    dryRun,
}: {
    manifestPath: string;
    entries: ManifestEntries;
    check: boolean;
    dryRun: boolean;
}): Promise<PopulationResponse> =>
    internalPopulateFile({
        check,
        dryRun,
        filePath: manifestPath,
        content: stringToUint8Array(await renderManifest(manifestPath, entries)),
        signed: false,
        force: true,
        manifestPath: null,
    });

export const populateFile: PopulateFile = async (params, options) => {
    const normalized = await normalizeFileParams(params, options);
    const { manifestPath } = normalized;
    if (manifestPath === null) {
        return internalPopulateFile(normalized);
    }

    const previous = await loadManifest(manifestPath);
    const result = await internalPopulateFile(normalized, {
        entry: previous.get(normalized.filePath),
    });
    // Only this file's entry changes, so other files written to the same manifest are kept
    await populateManifest({
        manifestPath,
        entries: new Map([...previous, [normalized.filePath, entryFor(normalized)]]),
        check: normalized.check,
        dryRun: normalized.dryRun,
    });
    return result;
};

const readdirIfExists = async (dir: string): Promise<Dirent[]> => {
    try {
        return await readdir(dir, { recursive: true, withFileTypes: true });
    } catch (err) {
        if (hasCode(err, 'ENOENT')) {
            return [];
        }
        throw err;
    }
};

/**
 * Files to remove with `clean`: without a manifest, every file in the target directory that
 * this run didn't write. With one, only files the previous manifest lists, which are known to be
 * generated, so `clean` is safe in a directory that also holds other files.
 *
 * @param params - run state
 * @param params.files - files this run writes
 * @param params.targetDir - target directory
 * @param params.previous - previous manifest entries, or `null` without a manifest
 * @param params.manifestPath - absolute path of the manifest, or `null`
 * @param params.force - remove stale files even if they were edited
 * @returns absolute paths of stale files
 * @throws {PopulateFilesOwnershipError} if a stale file listed in the manifest was edited
 */
const findStalePaths = async ({
    files,
    targetDir,
    previous,
    manifestPath,
    force,
}: {
    files: readonly NormalizedParams[];
    targetDir: string;
    previous: ManifestEntries | null;
    manifestPath: string | null;
    force: boolean;
}): Promise<string[]> => {
    const generatedPaths = new Set([...files.map(f => f.filePath), manifestPath]);

    if (previous === null) {
        const entries = await readdirIfExists(targetDir);
        return entries
            .filter(e => e.isFile())
            .map(e => Path.join(e.parentPath, e.name))
            .filter(p => !generatedPaths.has(p));
    }

    const stale = await Promise.all(
        previous
            .entries()
            .filter(([filePath]) => !generatedPaths.has(filePath))
            .map(async ([filePath, entry]) => {
                const existing = await safeLoadFile(filePath);
                if (existing === null) {
                    return null;
                }
                if (!force) {
                    assertOwnedByManifest({ filePath, existing, entry });
                }
                return filePath;
            })
    );
    return stale.filter(filePath => filePath !== null);
};

export const populateFiles: PopulateFiles = async (params, options) => {
    const { files, check, dryRun, force, clean, targetDir, manifestPath } =
        await normalizeFilesParams(params, options);
    const previous = manifestPath === null ? null : await loadManifest(manifestPath);

    const populateResults = await Promise.all(
        files.map(async file =>
            internalPopulateFile(
                {
                    ...file,
                    dryRun: dryRun || check,
                    check: false,
                    force,
                    manifestPath,
                } satisfies NormalizedOptions & NormalizedParams,
                previous && { entry: previous.get(file.filePath) }
            )
        )
    );

    const stalePaths = clean
        ? await findStalePaths({ files, targetDir, previous, manifestPath, force })
        : [];

    // The manifest lists exactly this run's files, so stale ones drop out of it
    const manifestResults =
        manifestPath === null
            ? []
            : [
                  await populateManifest({
                      manifestPath,
                      entries: new Map(files.map(file => [file.filePath, entryFor(file)])),
                      check: false,
                      dryRun: dryRun || check,
                  }),
              ];

    const results = [
        ...populateResults,
        ...manifestResults,
        ...stalePaths.map(
            (filePath): PopulationResponseUpdated => ({
                filePath,
                updated: true,
                reason: 'stale-file',
            })
        ),
    ];

    if (check) {
        const writes = results.filter(
            (result): result is PopulationResponseUpdated => result.updated
        );
        if (writes.length > 0) {
            throw new PopulateFilesCheckError(
                writes.map(({ filePath, reason }) => ({ filePath, reason }))
            );
        }
    }

    if (!dryRun) {
        await Promise.all(stalePaths.map(async p => rm(p)));
    }

    return results;
};
