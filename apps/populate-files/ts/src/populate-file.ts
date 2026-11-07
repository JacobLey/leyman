import type { Dirent } from 'node:fs';
import type {
    NormalizedParams,
    PopulateFileParams,
    PopulateOptions,
    PopulationResponse,
} from './lib/lib/types.js';
import type { ManifestEntries } from './lib/manifest.js';
import type { PopulationPlan } from './lib/populate-file.js';
import { readdir } from 'node:fs/promises';
import Path from 'node:path';
import { stringToUint8Array } from 'uint8array-extras';
import { hasCode } from 'unknown-error';
import { safeLoadFile } from './lib/loader.js';
import { assertOwnedByManifest, entryFor, loadManifest, renderManifest } from './lib/manifest.js';
import { normalizeFileParams, normalizeFilesParams } from './lib/normalize.js';
import { applyPlans, planFile } from './lib/populate-file.js';

/**
 * @import { PopulateFilesCheckError, PopulateFilesOwnershipError } from './lib/lib/errors.js'
 */

/**
 * Write one file, or with `check` fail if it would change.
 *
 * Resolves to whether the file was (or, with `dryRun`, would be) written, with an absolute `filePath`. With a
 * manifest, the file and manifest are both decided before either is written.
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
 * Every file is decided before any is written or removed, so a refusal (or, with `check`, the one `Error` listing
 * everything out of date) leaves the files as they were.
 *
 * @rejects {PopulateFilesCheckError} `File <path> not up to date. Reason: <reason>` with `check`, joined with `, ` per
 *   file
 * @rejects {PopulateFilesOwnershipError} as for {@link PopulateFile}
 * @rejects {TypeError} if two files resolve to the same path, or `signed` content isn't a string
 */
export type PopulateFiles = (
    params: readonly PopulateFileParams[],
    options?: PopulateOptions
) => Promise<PopulationResponse[]>;

/**
 * Plan a manifest like any other generated file. It is always ours, so never checked for edits.
 *
 * @param manifestPath - absolute path
 * @param entries - entries by absolute path
 * @returns whether the manifest would be updated, and its content
 */
const planManifest = async (
    manifestPath: string,
    entries: ManifestEntries
): Promise<PopulationPlan> =>
    planFile({
        filePath: manifestPath,
        content: stringToUint8Array(await renderManifest(manifestPath, entries)),
        signed: false,
        force: true,
    });

export const populateFile: PopulateFile = async (params, options) => {
    const normalized = await normalizeFileParams(params, options);
    const { manifestPath } = normalized;
    const previous = manifestPath === null ? null : await loadManifest(manifestPath);

    const plan = await planFile(
        normalized,
        previous && { entry: previous.get(normalized.filePath) }
    );
    const plans = [plan];
    if (manifestPath !== null) {
        // Only this file's entry changes, so other files written to the same manifest are kept
        const entries = new Map(previous);
        entries.set(normalized.filePath, entryFor(normalized));
        plans.push(await planManifest(manifestPath, entries));
    }

    // The file is reported before its manifest, as a check of either fails the call
    await applyPlans(plans, {
        check: normalized.check,
        dryRun: normalized.dryRun,
        firstOnly: true,
    });
    return plan.response;
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

    const filePlans = await Promise.all(
        files.map(async file =>
            planFile({ ...file, force }, previous && { entry: previous.get(file.filePath) })
        )
    );

    const stalePaths = clean
        ? await findStalePaths({ files, targetDir, previous, manifestPath, force })
        : [];

    // The manifest lists exactly this run's files, so stale ones drop out of it
    const manifestPlans =
        manifestPath === null
            ? []
            : [
                  await planManifest(
                      manifestPath,
                      new Map(files.map(file => [file.filePath, entryFor(file)]))
                  ),
              ];

    const plans: PopulationPlan[] = [
        ...filePlans,
        ...manifestPlans,
        ...stalePaths.map(filePath => ({
            response: { filePath, updated: true, reason: 'stale-file' } as const,
            content: null,
        })),
    ];

    await applyPlans(plans, { check, dryRun, firstOnly: false });
    return plans.map(({ response }) => response);
};
