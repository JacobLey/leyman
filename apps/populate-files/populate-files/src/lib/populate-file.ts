import type {
    NormalizedFileParams,
    PopulationResponse,
    PopulationResponseUpdateReason,
} from './lib/types.js';
import { mkdir, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { areUint8ArraysEqual, stringToUint8Array, uint8ArrayToString } from 'uint8array-extras';
import { formatErrorMessage } from './lib/errors.js';
import { safeLoadFile } from './loader.js';
import { signContent } from './sign-content.js';

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
 * @returns whether the file was (or would be) updated, and why
 */
export const internalPopulateFile = async (
    params: NormalizedFileParams
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
            throw new Error(formatErrorMessage({ filePath, reason }));
        }

        await createPathAndWrite({ filePath, content, dryRun });
        return { filePath, reason, updated: true };
    }

    if (areUint8ArraysEqual(rawFile, content)) {
        return { filePath, updated: false };
    }

    reason = 'content-changed';

    if (check) {
        throw new Error(formatErrorMessage({ filePath, reason }));
    }
    await createPathAndWrite({ filePath, content, dryRun });

    return { filePath, reason, updated: true };
};
