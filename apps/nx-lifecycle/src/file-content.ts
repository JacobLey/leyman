import type { PopulateFileParams } from 'load-populate-files';
import lifecycleSchema from './lifecycle/schema.js';

export default [
    {
        filePath: './src/lifecycle/schema.json',
        content: lifecycleSchema,
    },
] satisfies PopulateFileParams[];
