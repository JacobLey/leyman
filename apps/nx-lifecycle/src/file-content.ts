import type { PopulateFileParams } from 'load-populate-files';
import { lifecycleOptions, lifecycleOptionsOrConfig } from './lifecycle/schema.js';

export default [
    {
        filePath: './schema.json',
        content: lifecycleOptions,
    },
    {
        filePath: './nx-executor/schema.json',
        content: lifecycleOptionsOrConfig,
    },
] satisfies PopulateFileParams[];
