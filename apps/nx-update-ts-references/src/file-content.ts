import type { PopulateFileParams } from 'npm-load-populate-files';
import updateTsReferencesOptionsSchema from './executors/update-ts-references/schema.js';

export default [
    {
        filePath: './src/executors/update-ts-references/schema.json',
        content: updateTsReferencesOptionsSchema,
    },
] satisfies PopulateFileParams[];
