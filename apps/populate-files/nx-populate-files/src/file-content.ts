import type { PopulateFileParams } from 'load-populate-files';
import populateFilesOptionsSchema from './executors/populate-files/schema.js';

export default [
    {
        filePath: './src/executors/populate-files/schema.json',
        content: populateFilesOptionsSchema,
    },
] satisfies PopulateFileParams[];
