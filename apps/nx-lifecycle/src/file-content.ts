// eslint-disable-next-line import-x/no-extraneous-dependencies -- only loaded by the build-time populate-files target, never by consumers
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
