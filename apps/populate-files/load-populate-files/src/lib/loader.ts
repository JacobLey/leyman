import type { PopulateFileParams } from 'populate-files';
import type { Importer } from './lib/dependencies.js';
import { defaultImport } from 'default-import';
import { isPopulateFileParams } from './lib/populate-files-validator.js';

export type LoadFile = (filePath: string) => Promise<PopulateFileParams[]>;

export const loadFileProvider =
    (importer: Importer): LoadFile =>
    async filePath => {
        const mod = await importer(filePath).catch((err: unknown) => {
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
