import { PopulateFileParams } from 'populate-files';
import { defaultImport } from 'default-import';

export const loadFile = async (filePath: string): Promise<PopulateFileParams[]> => {

    const mod = await import(filePath);
    const params = defaultImport<PopulateFileParams | PopulateFileParams[]>(mod);

    return Array.isArray(params) ? params : [params];
};
