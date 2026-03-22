import type { PopulateFileParams } from 'load-populate-files';
import schema from './lifecycle/schema.js';

export default {
    filePath: './schema.json',
    content: schema,
} satisfies PopulateFileParams;
