import { readFile } from 'node:fs/promises';
import { hasCode } from 'unknown-error';

/**
 * Read file bytes, resolving with null if the file does not exist.
 *
 * Any other failure (e.g. `EACCES`, or a directory at the path) is thrown, rather than reported
 * as a missing file.
 *
 * @param filePath - absolute path to file
 * @returns file bytes, or null if the file does not exist
 */
export const safeLoadFile = async (filePath: string): Promise<Uint8Array | null> => {
    try {
        return await readFile(filePath);
    } catch (err) {
        if (hasCode(err, 'ENOENT')) {
            return null;
        }
        throw err;
    }
};
