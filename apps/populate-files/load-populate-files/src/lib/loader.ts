import { defaultImport } from 'default-import';
import type { PopulateFileParams } from 'populate-files';

export const loadFile = async (filePath: string): Promise<PopulateFileParams[]> => {
    const mod = (await import(filePath)) as PopulateFileParams | PopulateFileParams[];
    const params = defaultImport(mod);

    return [params].flat();
};
