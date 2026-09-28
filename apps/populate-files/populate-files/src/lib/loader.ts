import { readFile } from 'node:fs/promises';

/**
 * Read file bytes, and will simply resolve with null
 * if file reading fails, most likely due to non-existence.
 *
 * @param filePath - absolute path to file
 * @returns file bytes, or null if file could not be read
 */
export const safeLoadFile = async (filePath: string): Promise<Uint8Array | null> => {
    try {
        return await readFile(filePath);
    } catch {
        return null;
    }
};
