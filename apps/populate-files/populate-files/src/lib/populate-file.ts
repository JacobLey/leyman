import type { ManifestEntry } from 'generated-signature';
import type { NormalizedParams, PopulationResponse } from './lib/types.js';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { areUint8ArraysEqual, stringToUint8Array, uint8ArrayToString } from 'uint8array-extras';
import { PopulateFilesCheckError } from './lib/errors.js';
import { safeLoadFile } from './loader.js';
import { assertOwnedByManifest } from './manifest.js';
import { signContent } from './sign-content.js';

/**
 * @import { PopulateFilesOwnershipError } from './lib/errors.js'
 */

/**
 * What a call does to a file: its result, and the content to write when it is updated (none when it is removed).
 */
export interface PopulationPlan {
    readonly response: PopulationResponse;
    readonly content: Uint8Array | null;
}

/**
 * Decide whether a file is written, without writing it, checking that an existing file is owned: by its signature
 * when signed, or else by its manifest entry, when there is a manifest.
 *
 * @param params - normalized file params
 * @param params.force - overwrite files that aren't owned
 * @param manifest - with a manifest, the file's entry in it (if any), to check ownership against
 * @returns the file's result, and its content
 * @rejects {PopulateFilesOwnershipError} if the existing file may not be overwritten
 */
export const planFile = async (
    params: NormalizedParams & { readonly force: boolean },
    manifest: { entry: ManifestEntry | undefined } | null = null
): Promise<PopulationPlan> => {
    const { filePath } = params;
    const rawFile = await safeLoadFile(filePath);
    const content = params.signed
        ? stringToUint8Array(
              signContent({
                  filePath,
                  generated: params.content,
                  existing: rawFile && uint8ArrayToString(rawFile),
                  force: params.force,
              })
          )
        : params.content;

    if (rawFile === null) {
        return { response: { filePath, reason: 'file-not-exist', updated: true }, content };
    }

    if (areUint8ArraysEqual(rawFile, content)) {
        return { response: { filePath, updated: false }, content: null };
    }

    // Signed files prove ownership with their own token, checked while signing
    if (manifest && !params.signed && !params.force) {
        assertOwnedByManifest({ filePath, existing: rawFile, entry: manifest.entry });
    }

    return { response: { filePath, reason: 'content-changed', updated: true }, content };
};

/**
 * With `check`, fail if any plan would write or remove a file, listing them; otherwise apply the plans, unless it is a
 * dry run. Nothing is written until every file was decided, so a refusal leaves the files as they were.
 *
 * @param plans - every file of the call
 * @param options - of the call
 * @param options.check - fail instead of writing
 * @param options.dryRun - do not write
 * @param options.firstOnly - with `check`, list only the first outdated file
 * @rejects {PopulateFilesCheckError} with `check`, when a file is out of date
 */
export const applyPlans = async (
    plans: readonly PopulationPlan[],
    { check, dryRun, firstOnly }: { check: boolean; dryRun: boolean; firstOnly: boolean }
): Promise<void> => {
    if (check) {
        const outdated = plans
            .map(({ response }) => response)
            .filter(response => response.updated)
            .map(({ filePath, reason }) => ({ filePath, reason }));
        if (outdated.length > 0) {
            throw new PopulateFilesCheckError(firstOnly ? outdated.slice(0, 1) : outdated);
        }
        return;
    }
    if (dryRun) {
        return;
    }

    await Promise.all(
        plans.map(async ({ response, content }) => {
            if (!response.updated) {
                return;
            }
            if (content === null) {
                await rm(response.filePath);
                return;
            }
            await mkdir(Path.dirname(response.filePath), { recursive: true });
            await writeFile(response.filePath, content);
        })
    );
};
