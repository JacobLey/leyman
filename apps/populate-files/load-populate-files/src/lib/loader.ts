import type { PopulateFileParams } from 'populate-files';
import { defaultImport } from 'default-import';
import { isPopulateFileParams } from './lib/populate-files-validator.js';

/**
 * Dynamically import a JS file and validate its default export as populate-files input.
 *
 * @param filePath - absolute path to JS file
 * @returns list of populate-files params exported by the file
 */
export const loadFile = async (filePath: string): Promise<PopulateFileParams[]> => {
    const mod: unknown = await import(filePath).catch((err: unknown) => {
        if (String(err).includes('ERR_MODULE_NOT_FOUND')) {
            throw new Error(`JS file not found: ${filePath}`);
        }
        throw err;
    });
    const params = defaultImport(mod);

    if (isPopulateFileParams(params)) {
        return [params].flat();
    }

    throw new Error(`File content does not fulfill populate-file input at: ${filePath}`);
};
