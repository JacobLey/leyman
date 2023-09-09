import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadRawFile } from './loader.js';
import type {
    NormalizedFileParams,
    PopulationResponse,
    PopulationResponseUpdateReason,
} from './types.js';

export const formatErrorMessage = ({ filePath, reason }: {
    filePath: string;
    reason: PopulationResponseUpdateReason;
}) => {
    return `File ${filePath} not up to date. Reason: ${reason}`;
};

const createPathAndWrite = async({
    filePath,
    content,
    dryRun,
}: {
    filePath: string;
    content: Buffer;
    dryRun: boolean;
}): Promise<void> => {
    if (dryRun) {
        return;
    }

    await mkdir(dirname(filePath), {
        recursive: true,
    });

    await writeFile(filePath, content);
};

export const internalPopulateFile = async (
    { filePath, content, check, dryRun }: NormalizedFileParams
): Promise<PopulationResponse> => {
    const rawFile = await loadRawFile(filePath);

    let reason: PopulationResponseUpdateReason;

    if (rawFile === null) {
        reason = 'file-not-exist';
        if (check) {
            throw new Error(formatErrorMessage({ filePath, reason }));
        }

        await createPathAndWrite({ filePath, content, dryRun });
        return { filePath, updated: true, reason };
    }

    if (rawFile.equals(content)) {
        return { filePath, updated: false };
    }

    reason = 'content-changed';

    if (check) {
        throw new Error(formatErrorMessage({ filePath, reason }));
    }
    await createPathAndWrite({ filePath, content, dryRun });

    return { filePath, updated: true, reason };
};
