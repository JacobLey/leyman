import type { PopulateFileParams } from 'npm-load-populate-files';
import buildOptionsSchema from './executors/build/schema.js';

export default [
    {
        filePath: './src/executors/build/schema.json',
        content: buildOptionsSchema,
    },
] satisfies PopulateFileParams[];
