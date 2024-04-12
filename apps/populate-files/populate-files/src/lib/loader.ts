import { readFile } from 'node:fs/promises';

export const loadRawFile = async (
    filePath: string
): Promise<Uint8Array | null> => {
    try {
        return await readFile(filePath);
    } catch {
        return null;
    }
};
