import type { PopulateFileParams } from 'load-populate-files';
import generateSchema from './generate/schema.js';

export default [
    {
        filePath: './src/generate/schema.json',
        content: generateSchema,
    },
] satisfies PopulateFileParams[];
