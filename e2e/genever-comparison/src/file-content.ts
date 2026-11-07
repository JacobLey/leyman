/* eslint-disable import-x/no-extraneous-dependencies -- The whole file is only loaded by the populate-files target */
import type { PopulateFileParams } from 'load-populate-files';
import { jsonSchema, openApiDocument } from './documents.js';

/**
 * The documents every tool gets, as JSON for the comparison of Go generators (`e2e/genever-go-comparison`), which
 * reads them by path.
 */
export default [
    { filePath: './json-schema.json', content: jsonSchema },
    { filePath: './openapi.json', content: openApiDocument },
] satisfies readonly PopulateFileParams[];
