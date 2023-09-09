import type { PopulateFileParams } from 'load-populate-files';
import lifecycleSchema from './executors/lifecycle/schema.js';

export default [
    {
        filePath: './src/executors/lifecycle/schema.json',
        content: lifecycleSchema,
    },
] satisfies PopulateFileParams[];
