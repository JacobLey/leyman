import { readFile } from 'fs/promises';

export const loadRawFile = async (filePath: string): Promise<Buffer | null> => {
    try {
        return await readFile(filePath);
    } catch {
        return null;
    }
};
