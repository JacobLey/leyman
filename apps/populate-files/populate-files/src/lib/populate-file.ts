import type { ManifestEntry } from 'generated-signature';
import type {
    NormalizedFileParams,
    PopulationResponse,
    PopulationResponseUpdateReason,
} from './lib/types.js';
import { mkdir, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { areUint8ArraysEqual, stringToUint8Array, uint8ArrayToString } from 'uint8array-extras';
import { PopulateFilesCheckError } from './lib/errors.js';
import { safeLoadFile } from './loader.js';
import { assertOwnedByManifest } from './manifest.js';
import { signContent } from './sign-content.js';

/**
 * @import { PopulateFilesOwnershipError } from './lib/errors.js'
 */

const createPathAndWrite = async ({
    filePath,
    content,
    dryRun,
}: {
    filePath: string;
    content: Uint8Array;
    dryRun: boolean;
}): Promise<void> => {
    if (dryRun) {
        return;
    }

    await mkdir(Path.dirname(filePath), {
        recursive: true,
    });

    await writeFile(filePath, content);
};

/**
 * Internal file population logic, operating on already-normalized params.
 *
 * @param params - normalized file params
 * @param manifest - with a manifest, the file's entry in it (if any), to check ownership against
 * @returns whether the file was (or would be) updated, and why
 * @rejects {Error} in `check` mode, if the file would change
 * @rejects {PopulateFilesOwnershipError} if the existing file may not be overwritten
 */
export const internalPopulateFile = async (
    params: NormalizedFileParams,
    manifest: { entry: ManifestEntry | undefined } | null = null
): Promise<PopulationResponse> => {
    const { filePath, check, dryRun } = params;
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

    let reason: PopulationResponseUpdateReason;

    if (rawFile === null) {
        reason = 'file-not-exist';
        if (check) {
            throw new PopulateFilesCheckError([{ filePath, reason }]);
        }

        await createPathAndWrite({ filePath, content, dryRun });
        return { filePath, reason, updated: true };
    }

    if (areUint8ArraysEqual(rawFile, content)) {
        return { filePath, updated: false };
    }

    reason = 'content-changed';

    // Signed files prove ownership with their own token, checked while signing
    if (manifest && !params.signed && !params.force) {
        assertOwnedByManifest({ filePath, existing: rawFile, entry: manifest.entry });
    }

    if (check) {
        throw new PopulateFilesCheckError([{ filePath, reason }]);
    }
    await createPathAndWrite({ filePath, content, dryRun });

    return { filePath, reason, updated: true };
};
