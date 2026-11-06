// eslint-disable-next-line import-x/no-extraneous-dependencies -- only loaded by the build-time populate-files target, never by consumers
import type { PopulateFileParams } from 'load-populate-files';
import {
    executorJsonSchema,
    initGeneratorJsonSchema,
    optionsJsonSchema,
    packageGeneratorJsonSchema,
} from './lib/schema.js';

export default [
    { filePath: './schema.json', content: optionsJsonSchema },
    { filePath: './executors/targets/schema.json', content: executorJsonSchema },
    { filePath: './generators/init/schema.json', content: initGeneratorJsonSchema },
    { filePath: './generators/package/schema.json', content: packageGeneratorJsonSchema },
] satisfies PopulateFileParams[];
